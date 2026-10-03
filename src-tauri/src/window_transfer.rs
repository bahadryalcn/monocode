use std::collections::HashMap;
use std::sync::{mpsc, Mutex};

use tauri::{Emitter, Manager, State, WebviewWindow};

pub type WindowReady = mpsc::Receiver<Result<(), String>>;

/// Tab payloads waiting for the window they were staged for, keyed by label.
pub struct WindowTransferState {
    payloads: Mutex<HashMap<String, String>>,
    ready: Mutex<HashMap<String, PendingTransfer>>,
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
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app = window.app_handle();
        let point = if let Some((cx, cy)) = client_x.zip(client_y) {
            let origin = window.inner_position().map_err(|e| e.to_string())?;
            let scale = window.scale_factor().map_err(|e| e.to_string())?;
            Some((origin.x as f64 + cx * scale, origin.y as f64 + cy * scale))
        } else { None };
        let target = point.and_then(|(px, py)| {
            let mut windows = crate::window::workspace_windows(app);
            windows.sort_by_key(|candidate| (candidate.label() != "main", candidate.label().to_string()));
            windows.into_iter().find(|candidate| {
                if candidate.label() == window.label()
                    || !candidate.is_visible().unwrap_or(false)
                    || candidate.is_minimized().unwrap_or(true) { return false; }
                let (Ok(origin), Ok(size)) = (candidate.inner_position(), candidate.inner_size()) else { return false; };
                contains_point(origin.x as f64, origin.y as f64, size.width as f64, size.height as f64, px, py)
            })
        });
        if let Some(target) = target {
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
