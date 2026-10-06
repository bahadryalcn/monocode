use std::collections::HashMap;
use std::sync::{mpsc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

pub type WindowReady = mpsc::Receiver<Result<(), String>>;

/// Tab payloads waiting for the window they were staged for, keyed by label.
pub struct WindowTransferState {
    payloads: Mutex<HashMap<String, String>>,
    ready: Mutex<HashMap<String, PendingTransfer>>,
    drag_previews: Mutex<HashMap<String, DragPreviewState>>,
}

struct DragPreviewState {
    drag_id: String,
    source_id: String,
    revision: u64,
    target: Option<String>,
    closed_drag_ids: Vec<String>,
}

impl DragPreviewState {
    fn accepts_preview(&self, drag_id: &str, revision: u64) -> bool {
        revision > self.revision && !self.closed_drag_ids.iter().any(|closed| closed == drag_id)
    }

    fn clear(&mut self, drag_id: &str, revision: u64) -> Option<String> {
        // A clear can arrive before its first hover IPC. Remember that gesture
        // without changing another gesture's current revision or destination.
        if !self.closed_drag_ids.iter().any(|closed| closed == drag_id) {
            self.closed_drag_ids.push(drag_id.to_string());
            if self.closed_drag_ids.len() > 32 { self.closed_drag_ids.remove(0); }
        }
        if self.drag_id != drag_id || revision <= self.revision { return None; }
        self.revision = revision;
        self.target.take()
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowTabDragHover {
    drag_id: String,
    source_window_label: String,
    source_id: String,
    revision: u64,
    ended: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    x: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    y: Option<f64>,
}

struct PendingTransfer {
    id: Option<String>,
    sender: Option<mpsc::Sender<Result<(), String>>>,
}

impl WindowTransferState {
    pub fn new() -> Self {
        Self {
            payloads: Mutex::new(HashMap::new()),
            ready: Mutex::new(HashMap::new()),
            drag_previews: Mutex::new(HashMap::new()),
        }
    }

    pub fn stage(&self, label: &str, payload: String) -> Result<(), String> {
        if payload.trim().is_empty() {
            return Err("empty window transfer payload".into());
        }
        let mut payloads = self.payloads.lock().map_err(|err| err.to_string())?;
        if payloads.contains_key(label) {
            return Err("This window is already receiving a tab. Try again.".into());
        }
        payloads.insert(label.to_string(), payload);
        Ok(())
    }

    pub fn discard(&self, label: &str) {
        if let Ok(mut staged) = self.payloads.lock() {
            staged.remove(label);
        }
        if let Ok(mut ready) = self.ready.lock() {
            ready.remove(label);
        }
    }

    fn take(&self, label: &str) -> Result<Option<String>, String> {
        Ok(self
            .payloads
            .lock()
            .map_err(|err| err.to_string())?
            .remove(label))
    }

    fn take_checked(&self, label: &str, id: Option<&str>) -> Result<Option<String>, String> {
        let ready = self.ready.lock().map_err(|err| err.to_string())?;
        if let Some(id) = id {
            if ready.get(label).and_then(|pending| pending.id.as_deref()) != Some(id) {
                return Err("This transfer is no longer pending.".into());
            }
        } else if ready.get(label).is_some_and(|pending| pending.id.is_some()) {
            return Ok(None);
        }
        self.take(label)
    }

    pub fn watch_ready(&self, label: &str) -> Result<WindowReady, String> {
        let (sender, receiver) = mpsc::channel();
        self.ready.lock().map_err(|err| err.to_string())?.insert(
            label.to_string(),
            PendingTransfer {
                id: None,
                sender: Some(sender),
            },
        );
        Ok(receiver)
    }

    #[cfg(test)]
    fn acknowledge(&self, label: &str) -> Result<(), String> {
        self.finish(label, Ok(()))
    }

    #[cfg(test)]
    fn finish(&self, label: &str, result: Result<(), String>) -> Result<(), String> {
        self.finish_checked(label, None, result)
    }

    fn finish_checked(
        &self,
        label: &str,
        id: Option<&str>,
        result: Result<(), String>,
    ) -> Result<(), String> {
        let mut ready = self.ready.lock().map_err(|err| err.to_string())?;
        if let Some(pending) = ready.get_mut(label) {
            if pending.id.as_deref() != id {
                return Err("This transfer is no longer pending.".into());
            }
            // Keep the reservation until the sender has processed this reply.
            // Otherwise its cleanup could erase a subsequent transfer.
            if let Some(sender) = pending.sender.take() {
                sender.send(result).map_err(|err| err.to_string())?;
            }
        } else if id.is_some() {
            return Err("This transfer is no longer pending.".into());
        }
        Ok(())
    }
}

#[tauri::command]
pub fn reject_window_transfer(
    window: WebviewWindow,
    state: State<'_, WindowTransferState>,
    reason: String,
    transfer_id: Option<String>,
) -> Result<(), String> {
    state.finish_checked(window.label(), transfer_id.as_deref(), Err(reason))
}

fn contains_point(left: f64, top: f64, width: f64, height: f64, x: f64, y: f64) -> bool {
    x >= left && y >= top && x < left + width && y < top + height
}

fn source_screen_point(window: &WebviewWindow, client_x: f64, client_y: f64) -> Result<(f64, f64), String> {
    if !client_x.is_finite() || !client_y.is_finite() { return Err("Invalid pointer coordinates".into()); }
    let origin = window.inner_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    Ok((origin.x as f64 + client_x * scale, origin.y as f64 + client_y * scale))
}

fn window_at_point(app: &AppHandle, source_label: &str, px: f64, py: f64) -> Option<WebviewWindow> {
    // The source owns its own drop region even when another workspace window
    // lies beneath it. Use the same six logical-pixel pop-out threshold as JS.
    if let Some(source) = app.get_webview_window(source_label) {
        if let (Ok(origin), Ok(size), Ok(scale)) = (source.inner_position(), source.inner_size(), source.scale_factor()) {
            if source_owns_point(origin.x as f64, origin.y as f64, size.width as f64, size.height as f64, scale, px, py) {
                return None;
            }
        }
    }
    let mut windows = crate::window::workspace_windows(app);
    windows.sort_by_key(|candidate| (candidate.label() != "main", candidate.label().to_string()));
    windows.into_iter().find(|candidate| {
        if candidate.label() == source_label || !candidate.is_visible().unwrap_or(false)
            || candidate.is_minimized().unwrap_or(true) { return false; }
        let (Ok(origin), Ok(size)) = (candidate.inner_position(), candidate.inner_size()) else { return false; };
        contains_point(origin.x as f64, origin.y as f64, size.width as f64, size.height as f64, px, py)
    })
}

fn source_owns_point(left: f64, top: f64, width: f64, height: f64, scale: f64, x: f64, y: f64) -> bool {
    let margin = 6.0 * scale;
    x >= left - margin && x <= left + width + margin && y >= top - margin && y <= top + height + margin
}

fn destination_point(window: &WebviewWindow, point: (f64, f64)) -> Result<(f64, f64), String> {
    let origin = window.inner_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    Ok(((point.0 - origin.x as f64) / scale, (point.1 - origin.y as f64) / scale))
}

fn emit_drag_hover(app: &AppHandle, target: &str, payload: &WindowTabDragHover) -> Result<(), String> {
    app.emit_to(tauri::EventTarget::webview_window(target), "window_tab_drag_hover", payload).map_err(|e| e.to_string())
}

fn finish_drag_preview(window: &WebviewWindow, state: &WindowTransferState) {
    if let Ok(mut previews) = state.drag_previews.lock() {
        if let Some(previous) = previews.get_mut(window.label()) {
            let drag_id = previous.drag_id.clone();
            if let Some(target) = previous.clear(&drag_id, previous.revision.saturating_add(1)) {
                let _ = emit_drag_hover(window.app_handle(), &target, &WindowTabDragHover {
                    drag_id: previous.drag_id.clone(), source_window_label: window.label().to_string(),
                    source_id: previous.source_id.clone(), revision: previous.revision,
                    ended: true, x: None, y: None,
                });
            }
        }
    }
}

/// Monotonic source revisions also order the terminal clear. Late IPC updates
/// cannot resurrect a hint after release/cancel or a subsequent gesture.
#[tauri::command]
pub fn preview_window_tab_drag(
    window: WebviewWindow, state: State<'_, WindowTransferState>,
    client_x: f64, client_y: f64, drag_id: String, source_id: String, revision: u64,
) -> Result<(), String> {
    let point = source_screen_point(&window, client_x, client_y)?;
    let app = window.app_handle();
    let target = window_at_point(app, window.label(), point.0, point.1);
    let coords = target.as_ref().map(|target| destination_point(target, point)).transpose()?;
    let target_label = target.as_ref().map(|target| target.label().to_string());
    let mut previews = state.drag_previews.lock().map_err(|e| e.to_string())?;
    if let Some(previous) = previews.get(window.label()) {
        if !previous.accepts_preview(&drag_id, revision) { return Ok(()); }
        if previous.target != target_label {
            if let Some(previous_target) = &previous.target {
                let _ = emit_drag_hover(app, previous_target, &WindowTabDragHover {
                    drag_id: previous.drag_id.clone(), source_window_label: window.label().to_string(),
                    source_id: previous.source_id.clone(), revision, ended: true, x: None, y: None,
                });
            }
        }
    }
    let closed_drag_ids = previews.get(window.label()).map(|previous| previous.closed_drag_ids.clone()).unwrap_or_default();
    previews.insert(window.label().to_string(), DragPreviewState {
        drag_id: drag_id.clone(), source_id: source_id.clone(), revision, target: target_label.clone(),
        closed_drag_ids,
    });
    if let (Some(target), Some((x, y))) = (target_label, coords) {
        emit_drag_hover(app, &target, &WindowTabDragHover {
            drag_id, source_window_label: window.label().to_string(), source_id, revision, ended: false,
            x: Some(x), y: Some(y),
        })?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_window_tab_drag(
    window: WebviewWindow, state: State<'_, WindowTransferState>, drag_id: String, revision: u64,
) -> Result<(), String> {
    let mut previews = state.drag_previews.lock().map_err(|e| e.to_string())?;
    if let Some(previous) = previews.get_mut(window.label()) {
        if let Some(target) = previous.clear(&drag_id, revision) {
            emit_drag_hover(window.app_handle(), &target, &WindowTabDragHover {
                drag_id, source_window_label: window.label().to_string(), source_id: previous.source_id.clone(),
                revision, ended: true, x: None, y: None,
            })?;
        }
    } else {
        previews.insert(window.label().to_string(), DragPreviewState {
            closed_drag_ids: vec![drag_id.clone()], drag_id, source_id: String::new(), revision, target: None,
        });
    }
    Ok(())
}

/// Pointer coordinates are relative to the source webview. Convert to physical
/// screen pixels before comparing windows on monitors with different scaling.
#[tauri::command]
pub async fn move_window_tabs(
    window: WebviewWindow,
    transfer: String,
    x: Option<f64>,
    y: Option<f64>,
    client_x: Option<f64>,
    client_y: Option<f64>,
    relocate: bool,
    target_window_label: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app = window.app_handle();
        finish_drag_preview(&window, &app.state::<WindowTransferState>());
        let point = if let Some((cx, cy)) = client_x.zip(client_y) {
            Some(source_screen_point(&window, cx, cy)?)
        } else { None };
        let target = if let Some(label) = target_window_label.as_deref() {
            if label == window.label() { return Err("The session is already in this window.".into()); }
            Some(crate::window::workspace_windows(app).into_iter()
                .find(|candidate| candidate.label() == label)
                .ok_or_else(|| "The destination window is no longer open.".to_string())?)
        } else { point.and_then(|(px, py)| window_at_point(app, window.label(), px, py)) };
        if let Some(target) = target {
            // A cross-window drop is resolved in the receiving webview, so
            // pane edges use that window's own logical scale and DOM geometry.
            let transfer = if target_window_label.is_none() {
                if let Some((px, py)) = point {
                    let (x, y) = destination_point(&target, (px, py))?;
                    with_drop_point(&transfer, x, y)?
                } else { transfer }
            } else { transfer };
            let state = app.state::<WindowTransferState>();
            // Hold the readiness lock while staging so concurrent sources cannot
            // replace a transfer already consumed by its receiver.
            let (sender, receiver) = mpsc::channel();
            let transfer_id = uuid::Uuid::new_v4().to_string();
            {
                let mut ready = state.ready.lock().map_err(|e| e.to_string())?;
                if ready.contains_key(target.label()) { return Err("This window is already receiving a tab. Try again.".into()); }
                state.stage(target.label(), transfer)?;
                ready.insert(target.label().to_string(), PendingTransfer { id: Some(transfer_id.clone()), sender: Some(sender) });
            }
            let result = app.emit_to(tauri::EventTarget::webview_window(target.label()), "window_transfer_available", &transfer_id)
                .map_err(|e| e.to_string())
                .and_then(|_| receiver.recv_timeout(std::time::Duration::from_secs(30))
                    .map_err(|_| "The destination did not accept the tab. It remains in the original window.".to_string())?) ;
            state.discard(target.label());
            result?;
            let _ = target.unminimize();
            let _ = target.show();
            let _ = target.set_focus();
            return Ok("transferred".into());
        }
        if relocate && point.is_some() {
            let (px, py) = point.unwrap();
            let scale = window.scale_factor().map_err(|e| e.to_string())?;
            window.set_position(tauri::PhysicalPosition::new((px - 120.0 * scale) as i32, (py - 16.0 * scale) as i32)).map_err(|e| e.to_string())?;
            return Ok("relocated".into());
        }
        crate::window::open_transfer_window(app, transfer, x.zip(y))?;
        Ok("transferred".into())
    }).await.map_err(|e| e.to_string())?
}

fn with_drop_point(transfer: &str, x: f64, y: f64) -> Result<String, String> {
    let mut payload: serde_json::Value =
        serde_json::from_str(transfer).map_err(|e| e.to_string())?;
    let object = payload
        .as_object_mut()
        .ok_or("Invalid window transfer payload")?;
    object.insert("dropPoint".into(), serde_json::json!({ "x": x, "y": y }));
    serde_json::to_string(&payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn take_window_transfer(
    window: WebviewWindow,
    state: State<'_, WindowTransferState>,
    transfer_id: Option<String>,
) -> Result<Option<String>, String> {
    state.take_checked(window.label(), transfer_id.as_deref())
}

#[tauri::command]
pub fn window_transfer_ready(
    window: WebviewWindow,
    state: State<'_, WindowTransferState>,
    transfer_id: Option<String>,
) -> Result<(), String> {
    state.finish_checked(window.label(), transfer_id.as_deref(), Ok(()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_drag_clear_preserves_current_destination_and_revision() {
        let mut current = DragPreviewState {
            drag_id: "new".into(), source_id: "session".into(), revision: 200,
            target: Some("main".into()), closed_drag_ids: vec![],
        };
        assert!(current.clear("old", 900).is_none());
        assert_eq!(current.revision, 200);
        assert_eq!(current.target.as_deref(), Some("main"));
        assert!(current.accepts_preview("new", 201));
        assert!(!current.accepts_preview("old", 901));
    }

    #[test]
    fn clear_before_first_hover_prevents_late_preview_without_stopping_other_gesture() {
        let mut current = DragPreviewState {
            drag_id: "previous".into(), source_id: "session".into(), revision: 100,
            target: Some("main".into()), closed_drag_ids: vec![],
        };
        assert!(current.clear("not-yet-delivered", 300).is_none());
        assert!(!current.accepts_preview("not-yet-delivered", 200));
        assert!(!current.accepts_preview("not-yet-delivered", 400));
        assert!(current.accepts_preview("previous", 101));
        assert_eq!(current.clear("previous", 102).as_deref(), Some("main"));
        assert!(!current.accepts_preview("previous", 103));
        assert!(current.accepts_preview("next", 103));
    }

    #[test]
    fn source_region_blocks_phantom_underlying_target_until_popout_margin_is_crossed() {
        assert!(source_owns_point(-1600.0, 100.0, 1200.0, 900.0, 2.0, -500.0, 500.0));
        assert!(source_owns_point(-1600.0, 100.0, 1200.0, 900.0, 2.0, -388.0, 500.0));
        assert!(!source_owns_point(-1600.0, 100.0, 1200.0, 900.0, 2.0, -387.0, 500.0));
    }

    #[test]
    fn hover_protocol_uses_target_logical_coordinates_and_terminal_clear_has_no_point() {
        let active = WindowTabDragHover {
            drag_id: "drag-1".into(), source_window_label: "window-2".into(), source_id: "session-1".into(),
            revision: 42, ended: false, x: Some(120.5), y: Some(80.0),
        };
        let value = serde_json::to_value(&active).unwrap();
        assert_eq!(value["sourceWindowLabel"], "window-2");
        assert_eq!(value["sourceId"], "session-1");
        assert_eq!(value["dragId"], "drag-1");
        assert_eq!(value["x"], 120.5);
        assert_eq!(value["revision"], 42);
        let clear = WindowTabDragHover { revision: 43, ended: true, x: None, y: None, ..active };
        let value = serde_json::to_value(&clear).unwrap();
        assert_eq!(value["ended"], true);
        assert!(value.get("x").is_none());
        assert!(value.get("y").is_none());
    }

    #[test]
    fn cross_window_drop_keeps_payload_and_destination_coordinates() {
        let payload = with_drop_point(r#"{"tabs":[{"id":"moving"}]}"#, 120.5, 80.0).unwrap();
        let value: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["tabs"][0]["id"], "moving");
        assert_eq!(value["dropPoint"]["x"], 120.5);
        assert_eq!(value["dropPoint"]["y"], 80.0);
        assert!(with_drop_point("[]", 0.0, 0.0).is_err());
    }

    #[test]
    fn drop_bounds_support_negative_monitor_origins_and_physical_scaling() {
        assert!(contains_point(-2560.0, 0.0, 2560.0, 1440.0, -1200.0, 100.0));
        assert!(!contains_point(-2560.0, 0.0, 2560.0, 1440.0, 0.0, 100.0));
        // A 2x source at (2000, 0), dragged 600 logical px left.
        assert!(contains_point(
            0.0,
            0.0,
            1600.0,
            1200.0,
            2000.0 - 600.0 * 2.0,
            100.0
        ));
    }

    #[test]
    fn a_destination_rejection_is_returned_to_the_source() {
        let state = WindowTransferState::new();
        let ready = state.watch_ready("target").unwrap();
        state.finish("target", Err("duplicate tab".into())).unwrap();
        assert_eq!(ready.recv().unwrap(), Err("duplicate tab".into()));
    }

    #[test]
    fn staging_cannot_replace_an_unconsumed_transfer() {
        let state = WindowTransferState::new();
        state.stage("target", "original".into()).unwrap();
        assert!(state.stage("target", "replacement".into()).is_err());
        assert_eq!(state.take("target").unwrap().as_deref(), Some("original"));
    }

    #[test]
    fn stale_replies_cannot_complete_or_consume_a_later_transfer() {
        let state = WindowTransferState::new();
        let (sender, receiver) = mpsc::channel();
        state.ready.lock().unwrap().insert(
            "target".into(),
            PendingTransfer {
                id: Some("new".into()),
                sender: Some(sender),
            },
        );
        state.stage("target", "new payload".into()).unwrap();
        assert!(state.take_checked("target", Some("old")).is_err());
        assert!(state.finish_checked("target", Some("old"), Ok(())).is_err());
        assert_eq!(receiver.try_recv(), Err(mpsc::TryRecvError::Empty));
        assert_eq!(
            state
                .take_checked("target", Some("new"))
                .unwrap()
                .as_deref(),
            Some("new payload")
        );
        state.finish_checked("target", Some("new"), Ok(())).unwrap();
        assert_eq!(receiver.recv().unwrap(), Ok(()));
        assert!(state.ready.lock().unwrap().contains_key("target"));
        state.discard("target");
        assert!(!state.ready.lock().unwrap().contains_key("target"));
    }

    #[test]
    fn each_window_takes_only_its_own_payload() {
        let state = WindowTransferState::new();
        state.stage("window-1", "a".into()).unwrap();
        state.stage("window-2", "b".into()).unwrap();
        assert_eq!(state.take("window-2").unwrap().as_deref(), Some("b"));
        assert_eq!(state.take("window-1").unwrap().as_deref(), Some("a"));
        assert_eq!(state.take("window-1").unwrap(), None);
    }

    #[test]
    fn an_empty_payload_is_rejected() {
        assert!(WindowTransferState::new()
            .stage("window-1", " ".into())
            .is_err());
    }

    #[test]
    fn a_failed_window_leaves_nothing_behind() {
        let state = WindowTransferState::new();
        state.stage("window-1", "a".into()).unwrap();
        state.discard("window-1");
        assert_eq!(state.take("window-1").unwrap(), None);
    }

    #[test]
    fn readiness_is_scoped_and_taking_payload_is_not_readiness() {
        let state = WindowTransferState::new();
        state.stage("a", "payload".into()).unwrap();
        let ready = state.watch_ready("a").unwrap();
        state.take("a").unwrap();
        state.acknowledge("b").unwrap();
        assert!(matches!(ready.try_recv(), Err(mpsc::TryRecvError::Empty)));
        state.acknowledge("a").unwrap();
        assert_eq!(ready.try_recv(), Ok(Ok(())));
        state.acknowledge("a").unwrap();
    }

    #[test]
    fn discarding_a_transfer_releases_its_waiter() {
        let state = WindowTransferState::new();
        let ready = state.watch_ready("a").unwrap();
        state.discard("a");
        assert_eq!(ready.try_recv(), Err(mpsc::TryRecvError::Disconnected));
    }
}
