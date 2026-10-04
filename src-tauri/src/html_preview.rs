use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn html_file_url(path: &Path) -> Result<String, String> {
    let path = path
        .canonicalize()
        .map_err(|error| format!("Could not open HTML file: {error}"))?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !path.is_file()
        || !(extension.eq_ignore_ascii_case("html") || extension.eq_ignore_ascii_case("htm"))
    {
        return Err("Go Live requires an existing HTML file.".into());
    }
    url::Url::from_file_path(&path)
        .map(|url| url.to_string())
        .map_err(|_| "Could not create the HTML file URL.".into())
}

fn chrome_command() -> Command {
    #[cfg(windows)]
    {
        for variable in ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"] {
            if let Some(base) = std::env::var_os(variable) {
                let executable = PathBuf::from(base).join("Google/Chrome/Application/chrome.exe");
                if executable.is_file() {
                    return Command::new(executable);
                }
            }
        }
        Command::new("chrome.exe")
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("/usr/bin/open");
        command.args(["-a", "Google Chrome"]);
        command
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Command::new("google-chrome")
    }
}

fn launch_html(path: &Path) -> Result<(), String> {
    let url = html_file_url(path)?;
    let mut command = chrome_command();
    #[cfg(not(target_os = "macos"))]
    command.arg("--new-tab");
    command.arg(url);
    crate::harness::apply_gui_env(&mut command);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW: no console helper.
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!("Could not open Google Chrome. Check that Chrome is installed: {error}")
        })?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[tauri::command(async)]
pub async fn open_html_in_chrome(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_html(&PathBuf::from(path)))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_urls_preserve_special_characters_and_reject_other_files() {
        let root = std::env::temp_dir().join(format!("monocode-html-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let html = root.join("mağaza #1 %.HTML");
        std::fs::write(&html, "<html></html>").unwrap();
        let url = html_file_url(&html).unwrap();
        assert!(url.starts_with("file:///"));
        assert!(url.contains("%23"));
        assert!(url.contains("%25"));
        assert_eq!(
            url::Url::parse(&url)
                .unwrap()
                .to_file_path()
                .unwrap()
                .canonicalize()
                .unwrap(),
            html.canonicalize().unwrap()
        );
        let htm = root.join("page.htm");
        std::fs::write(&htm, "hello").unwrap();
        assert!(html_file_url(&htm).is_ok());
        let other = root.join("script.js");
        std::fs::write(&other, "hello").unwrap();
        assert!(html_file_url(&other).is_err());
        assert!(html_file_url(&root).is_err());
        assert!(html_file_url(&root.join("missing.html")).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
