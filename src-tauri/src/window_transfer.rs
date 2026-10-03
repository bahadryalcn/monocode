use std::collections::HashMap;
use std::sync::{mpsc, Mutex};

use tauri::{State, WebviewWindow};

/// Tab payloads waiting for the window they were staged for, keyed by label.
pub struct WindowTransferState {
    payloads: Mutex<HashMap<String, String>>,
    ready: Mutex<HashMap<String, mpsc::Sender<()>>>,
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
        self.payloads
            .lock()
            .map_err(|err| err.to_string())?
            .insert(label.to_string(), payload);
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

    pub fn watch_ready(&self, label: &str) -> Result<mpsc::Receiver<()>, String> {
        let (sender, receiver) = mpsc::channel();
        self.ready
            .lock()
            .map_err(|err| err.to_string())?
            .insert(label.to_string(), sender);
        Ok(receiver)
    }

    fn acknowledge(&self, label: &str) -> Result<(), String> {
        if let Some(sender) = self
            .ready
            .lock()
            .map_err(|err| err.to_string())?
            .remove(label)
        {
            sender.send(()).map_err(|err| err.to_string())?;
        }
        Ok(())
    }
}

#[tauri::command]
pub fn take_window_transfer(
    window: WebviewWindow,
    state: State<'_, WindowTransferState>,
) -> Result<Option<String>, String> {
    state.take(window.label())
}

#[tauri::command]
pub fn window_transfer_ready(
    window: WebviewWindow,
    state: State<'_, WindowTransferState>,
) -> Result<(), String> {
    state.acknowledge(window.label())
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(ready.try_recv(), Ok(()));
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
