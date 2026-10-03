//! The shells this computer can open a terminal in, as VS Code lists them:
//! PowerShell, Command Prompt, Git Bash and WSL on Windows; the login shell
//! and the others in /etc/shells elsewhere. The chosen one is used for new
//! terminals and for `!commands` typed in the composer.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShellProfile {
    /// Stable across launches: what the app saves as the user's choice.
    pub id: String,
    pub name: String,
    pub path: String,
    /// "powershell", "pwsh", "cmd", "bash", "wsl", "zsh", "fish" or "sh".
    pub kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellProfiles {
    pub profiles: Vec<ShellProfile>,
    /// What a terminal opens with when the user has not picked one.
    pub default_id: Option<String>,
    /// The user's pick for this computer, shared with its MonoCode Host.
    pub chosen_id: Option<String>,
}

#[tauri::command(async)]
pub fn terminal_profiles() -> ShellProfiles {
    let profiles = detect();
    let default_id = default_profile(&profiles).map(|profile| profile.id.clone());
    ShellProfiles {
        profiles,
        default_id,
        chosen_id: chosen_id(),
    }
}

/// Saves the shell this computer's terminals and `!commands` use; None goes
/// back to the system default. The MonoCode Host on this computer reads the
/// same file, so a session here runs a command the same way whichever
/// machine it was typed on.
#[tauri::command(async)]
pub fn set_terminal_profile(id: Option<String>) -> Result<(), String> {
    let path = choice_path().ok_or("No home folder")?;
    match id.filter(|id| !id.trim().is_empty()) {
        Some(id) => {
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            let body = serde_json::json!({ "profile": id }).to_string();
            std::fs::write(&path, body).map_err(|e| e.to_string())
        }
        None => match std::fs::remove_file(&path) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
            _ => Ok(()),
        },
    }
}

/// `~/.monocode-host/terminal-profile.json`, next to the host's own data.
fn choice_path() -> Option<PathBuf> {
    #[cfg(windows)]
    let home = std::env::var("USERPROFILE").ok()?;
    #[cfg(not(windows))]
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".monocode-host").join("terminal-profile.json"))
}

pub(crate) fn chosen_id() -> Option<String> {
    let raw = std::fs::read_to_string(choice_path()?).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value
        .get("profile")
        .and_then(|id| id.as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(String::from)
}

/// The profile `id` names; else the one chosen for this computer; else the
/// system default. A pick whose shell is gone falls through.
pub(crate) fn resolve(id: Option<&str>) -> Option<ShellProfile> {
    let profiles = detect();
    let find = |id: &str| profiles.iter().find(|profile| profile.id == id).cloned();
    id.and_then(find)
        .or_else(|| chosen_id().as_deref().and_then(find))
        .or_else(|| default_profile(&profiles).cloned())
}

fn default_profile(profiles: &[ShellProfile]) -> Option<&ShellProfile> {
    #[cfg(windows)]
    {
        // As VS Code: PowerShell, the newest one installed.
        ["pwsh", "powershell", "cmd"]
            .iter()
            .find_map(|id| profiles.iter().find(|profile| profile.id == *id))
            .or_else(|| profiles.first())
    }
    #[cfg(not(windows))]
    {
        let login = std::env::var("SHELL").ok().filter(|shell| !shell.is_empty());
        login
            .and_then(|shell| profiles.iter().find(|profile| profile.path == shell))
            .or_else(|| profiles.first())
    }
}

/// Arguments for an interactive terminal session in `profile`.
pub(crate) fn terminal_args(profile: &ShellProfile) -> Vec<String> {
    match profile.kind.as_str() {
        "powershell" | "pwsh" => vec!["-NoLogo".into()],
        "cmd" | "wsl" => Vec::new(),
        // Git Bash: a login shell sets up PATH for the Unix tools it ships.
        "bash" if cfg!(windows) => vec!["--login".into(), "-i".into()],
        "bash" | "zsh" | "sh" | "fish" => vec!["-l".into()],
        _ => Vec::new(),
    }
}

/// A process that runs one command line in `profile` and exits.
pub(crate) fn command_for(profile: &ShellProfile, line: &str) -> Command {
    let mut cmd = Command::new(&profile.path);
    match profile.kind.as_str() {
        "powershell" | "pwsh" => {
            cmd.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
            // Without this, PowerShell writes its pipe output in the OEM code page.
            cmd.arg(format!(
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {line}"
            ));
        }
        "cmd" => {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                // cmd parses its own command line; Rust's quoting would garble it.
                cmd.raw_arg(format!("/d /s /c \"{line}\""));
            }
            #[cfg(not(windows))]
            cmd.args(["/c", line]);
        }
        "wsl" => {
            cmd.args(["-e", "bash", "-lc", line]);
        }
        _ => {
            cmd.args(["-lc", line]);
        }
    }
    apply_profile_env(profile, &mut cmd);
    cmd
}

/// Git Bash's login profile changes to the home folder unless told to stay.
pub(crate) fn profile_env(profile: &ShellProfile) -> Vec<(&'static str, &'static str)> {
    if cfg!(windows) && profile.kind == "bash" {
        vec![("CHERE_INVOKING", "1"), ("MSYSTEM", "MINGW64")]
    } else {
        Vec::new()
    }
}

fn apply_profile_env(profile: &ShellProfile, cmd: &mut Command) {
    for (key, value) in profile_env(profile) {
        cmd.env(key, value);
    }
}

fn detect() -> Vec<ShellProfile> {
    let mut found = Vec::new();
    #[cfg(windows)]
    detect_windows(&mut found);
    #[cfg(not(windows))]
    detect_unix(&mut found);
    found
}

fn profile(id: &str, name: &str, path: &Path, kind: &str) -> ShellProfile {
    ShellProfile {
        id: id.into(),
        name: name.into(),
        path: path.to_string_lossy().into_owned(),
        kind: kind.into(),
    }
}

fn on_path(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

#[cfg(windows)]
fn detect_windows(found: &mut Vec<ShellProfile>) {
    let env_dir = |key: &str| std::env::var_os(key).map(PathBuf::from);
    let system_root = env_dir("SystemRoot").unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    let system32 = system_root.join("System32");
    let program_dirs: Vec<PathBuf> = ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"]
        .iter()
        .filter_map(|key| env_dir(key))
        .collect();

    let pwsh = on_path("pwsh.exe").or_else(|| {
        program_dirs
            .iter()
            .map(|dir| dir.join(r"PowerShell\7\pwsh.exe"))
            .find(|path| path.is_file())
    });
    if let Some(path) = pwsh {
        found.push(profile("pwsh", "PowerShell 7", &path, "pwsh"));
    }

    let powershell = system32.join(r"WindowsPowerShell\v1.0\powershell.exe");
    if powershell.is_file() {
        found.push(profile("powershell", "Windows PowerShell", &powershell, "powershell"));
    }

    let cmd = std::env::var_os("COMSPEC")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .unwrap_or_else(|| system32.join("cmd.exe"));
    if cmd.is_file() {
        found.push(profile("cmd", "Command Prompt", &cmd, "cmd"));
    }

    if let Some(path) = git_bash(&program_dirs) {
        found.push(profile("git-bash", "Git Bash", &path, "bash"));
    }

    let wsl = system32.join("wsl.exe");
    if wsl.is_file() {
        found.push(profile("wsl", "WSL", &wsl, "wsl"));
    }
}

/// Git for Windows' bash, next to the `git` on PATH or in its usual folders.
/// Not `System32\bash.exe`, which is WSL's launcher.
#[cfg(windows)]
fn git_bash(program_dirs: &[PathBuf]) -> Option<PathBuf> {
    let beside_git = on_path("git.exe").and_then(|git| {
        // <root>\cmd\git.exe or <root>\mingw64\bin\git.exe
        git.ancestors()
            .skip(1)
            .take(3)
            .map(|dir| dir.join(r"bin\bash.exe"))
            .find(|path| path.is_file())
    });
    let local = std::env::var_os("LOCALAPPDATA")
        .map(|dir| PathBuf::from(dir).join(r"Programs\Git\bin\bash.exe"));
    beside_git
        .into_iter()
        .chain(program_dirs.iter().map(|dir| dir.join(r"Git\bin\bash.exe")))
        .chain(local)
        .find(|path| path.is_file())
}

#[cfg(not(windows))]
fn detect_unix(found: &mut Vec<ShellProfile>) {
    let mut paths: Vec<String> = Vec::new();
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            paths.push(shell);
        }
    }
    if let Ok(listed) = std::fs::read_to_string("/etc/shells") {
        for line in listed.lines() {
            let line = line.trim();
            if line.starts_with('/') {
                paths.push(line.to_string());
            }
        }
    }
    for fallback in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
        paths.push(fallback.into());
    }
    let _ = on_path;
    for path in paths {
        let path_buf = PathBuf::from(&path);
        if !path_buf.is_file() || found.iter().any(|entry| entry.path == path) {
            continue;
        }
        let stem = path_buf
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("sh")
            .to_string();
        let kind = match stem.as_str() {
            "zsh" | "bash" | "fish" => stem.clone(),
            _ => "sh".into(),
        };
        // Two shells of one name (Homebrew's and the system's) both stay
        // listed, told apart by their path.
        let name = if found.iter().any(|entry| entry.name == stem) {
            format!("{stem} ({path})")
        } else {
            stem.clone()
        };
        found.push(ShellProfile {
            id: path.clone(),
            name,
            path,
            kind,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_default_shell_on_this_machine() {
        let listed = terminal_profiles();
        assert!(!listed.profiles.is_empty());
        let default = listed.default_id.expect("a default profile");
        assert!(listed.profiles.iter().any(|profile| profile.id == default));
        // The user's own pick on this machine comes first; without one, the default.
        let expected = listed
            .chosen_id
            .filter(|id| listed.profiles.iter().any(|profile| &profile.id == id))
            .unwrap_or(default);
        assert_eq!(resolve(Some("no-such-profile")).map(|p| p.id), Some(expected.clone()));
        assert_eq!(resolve(None).map(|p| p.id), Some(expected));
    }

    #[test]
    fn every_listed_shell_runs_a_command() {
        for profile in detect() {
            // WSL may be installed with no distribution.
            if profile.kind == "wsl" {
                continue;
            }
            let output = command_for(&profile, "echo monocode-profile")
                .current_dir(std::env::temp_dir())
                .output()
                .unwrap_or_else(|error| panic!("{}: {error}", profile.name));
            let text = String::from_utf8_lossy(&output.stdout);
            assert!(
                text.contains("monocode-profile"),
                "{} printed {text:?}",
                profile.name
            );
        }
    }
}
