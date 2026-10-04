# MonoCode performans TODO — 4 Ekim 2026 (render, native, paneller, host, build)

Bu liste [3 Ekim listesinin](performance-todo-2026-10-03.md) devamıdır. O liste ağ/polling/host/sync tarafını kapsıyordu; bu inceleme onun bakmadığı yerlere baktı: React render yolu, Rust backend, özellik panelleri, bundle/build. Numaralar P27'den devam eder. **38 yeni madde** var (durum: `[x]` yapıldı ve gözden geçirildi, `[~]` kısmi, `[ ]` açık; her maddenin altındaki **Durum** satırına bak). Yapılanlar hedefli testlerle doğrulandı; hiçbiri çalışan uygulamada ölçülmedi, commit yapılmadı; 3 Ekim listesindeki açık maddeler de aşağıda güncel durumlarıyla özetlendi.

## Kanıt sınırı

- Bütün bulgular **kaynak koddan okunarak** çıkarıldı. Bu incelemede profil, trace, benchmark, build veya test çalıştırılmadı. Etki tahminleri ölçüm değildir.
- **Doğrulandı:** kod yolu baştan sona okundu. **Olası:** yapı görüldü, büyüklüğü ölçüm ister. **Doğrulanmadı:** varsayıma dayanıyor, önce kontrol edilmeli.
- Çalışma ağacı inceleme sırasında değişiyordu; özellikle `src/app/App.tsx` satır numaraları ~70 satır kaymış olabilir. App.tsx maddelerinde tanımlayıcı adlarıyla ara.
- Uygulama koduna dokunulmadı; yalnızca bu dosya eklendi. Commit yapılmadı.
- İncelenmeyenler: `Composer.tsx` ve `ProjectRail.tsx` iç gövdeleri, Streamdown/Shiki iç kodu, PDF/DOCX/sheet/görsel görüntüleyiciler, Inbox detay, Notes kayıt yolu, ayarlar UI, `layout.ts` kalıcılığı, bildirim/group-lock/orchestration/quick-composer zamanlayıcıları, `GitHistoryGraph`; Rust tarafında `session_import.rs`, `azure_devops.rs`, `gitlab.rs`, `jira.rs`, `linear.rs`, `mcp.rs`, `skills.rs`, `window.rs`, macOS modülleri. `automations.rs`, `remote_ssh.rs`, `worktrees.rs` yalnızca gözden geçirildi.

## Ana tablo

3 Ekim'deki canlı ölçümde renderer tek çekirdeğin ~%110'unu, WebView GPU süreci ~%80'ini kullanıyordu; native süreç ~%2 idi. Bu incelemenin en güçlü açıklaması:

1. Token akışı zaten kare başına tek `setSessions` ile toplanıyor ve yapısal paylaşım kullanıyor — **boru hattı sağlam**. Maliyet, o tek state değişiminin tetiklediklerinde: `sessions` ~11.700 satırlık `Workspace` bileşeninde durduğu için her karede kök, Sidebar, TitleBar, Composer ve görünür transcript yeniden işleniyor (P27–P31).
2. Bir ajan meşgulken `shimmer-text` animasyonu token gelmese bile her karede ana thread'de boyama yaptırıyor (P32). GPU sürecindeki yükün olası adayı; payı ölçülmedi.
3. Yerel tarafta her 1,5 saniyelik canlı kayıt, tek SQLite kilidi altında bütün transcript'i birkaç kez JSON'dan geçirip yeniden yazıyor (P37). Bu, 3 Ekim P15'in native yarısı.

Bu üçü ölçümle doğrulanmadan sıralama kesin değildir; önerilen ilk adım P27–P32 için bir React Profiler + Performance trace almaktır.

---

## A — Renderer: akış sırasında render maliyeti

- [x] **P27 — `sessions` state'ini `Workspace` kökünden çıkar. [P1; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `sessions` Zustand store'unda (`src/features/sessions/model/sessionsStore.ts`). `Workspace` yalnızca akan metin değiştiğinde aynı kalan "shell" dizisine abone; `sessionsRef` her zaman store'un güncel değerini okuyor; `SessionPane`, `AgentTabView`, plan sekmesi ve arama görünümü canlı oturuma kendileri abone. Güncellemeler eski `setState` ile aynı şekilde toplansın diye abonelik React state üzerinden. tsc temiz. **Serinin en riskli değişikliği: uygulamada çalıştırılmadı, profil alınmadı.**
  - Kanıt: `src/app/App.tsx` — `Workspace` içindeki `const [sessions, setSessions] = useState<Session[]>` (~`:1124`); `flushHarnessEvents` → `setSessions`; `src/app/model/harnessFlush.ts:10–18` (ön planda kare başına, arka planda 100 ms).
  - Etki: her flush `Workspace` gövdesini yeniden çalıştırır: ~60 `useState`, ~62 `useEffect`, ~260 `useMemo`/`useCallback` bağımlılık kontrolü; `sessions`'a bağlı effect'ler (biri her karede 650 ms timer'ı silip yeniden kuruyor) ve memo'lar her karede yeniden hesaplanır. Aşağıdaki maddelerin hepsini çarpar.
  - TODO: `sessions`'ı harici store'a taşı (`useSyncExternalStore`, oturum başına selector). `Workspace` yalnızca blok metni değişince kimliği değişmeyen bir "oturum meta" dilimine (id, busy, başlık, cwd, needs-input) abone olsun; her `SessionPane` kendi oturumuna.
  - Kabul: React Profiler'da akış sırasında `Workspace` commit'i ~60/s'den, tool/durum değişimi dışında ~0'a insin; yalnızca akan `SessionPane` alt ağacı commit etsin.

- [x] **P28 — `Sidebar`/`TitleBar` memo'larını bozan prop'ları sabitle; `MenuBar`'ı memo'la. [P1; yeniden render doğrulandı, Sidebar iç maliyeti olası]**
  - **Durum (4 Eki):** Yapıldı — türetilmiş prop'lar içerik eşitliğiyle sabitlendi (`src/app/model/sidebarEquality.ts`), inline callback'ler `useCallback`, `MenuBar` memo. tsc temiz, 33 test. Render sayısı profille doğrulanmadı.
  - Kanıt: `App.tsx` — `busyProjectPaths={sessions.flatMap(...)}` (her render yeni dizi), inline `onDismissUpdate`, `liveAgents`, `sidebarHistory` (`sessionHistory.ts:172`, her zaman yeni dizi), `openProjectSessions`, `worktreeTabStats` (yeni `Map`); `TitleBar` için inline `onMoveToNewWindow`; `<MenuBar>` memo'suz + üç inline zoom closure. `Sidebar.tsx:2652`, `TitleBar.tsx:1294` memo'lu.
  - Etki: 4.234 satırlık Sidebar (içinde memo'suz `ProjectRail`) ve TitleBar her akış karesinde yeniden render olur.
  - TODO: `busyProjectPaths`'i zaten sabit olan `busySessionIds`'ten türet; inline callback'leri sabitle; dört türetilmiş değere `titleTabsEqual` benzeri içerik eşitliği koruması ekle. P27'den bağımsız yapılabilir, hızlı kazanım.
  - Kabul: yalnızca metin akarken Profiler'da Sidebar/TitleBar commit'i sıfır.

- [x] **P29 — `AgentTranscript`'te tur başına memo'lu bileşen; her karede tüm transcript türetimini kaldır. [P1; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — memo'lu `Turn` (`sameTurn`), `groupTurnsStable`, `harnessesForTurns`, kopya metni tıklamada. 1.403 test. Profil alınmadı.
  - Kanıt: `src/features/sessions/ui/AgentTranscript.tsx:489` (`groupTurns(blocks)` memo'suz), `:680–762` (görünür her tur için `groupTurnItems`, `foldableWork`, `activityStillRunning`), `:974` (`turnCopyText(turn)` — bitmiş her tur için tüm metni regex+join), `:712` (`harnessForTurn`), `:965–988` (`TurnDuration` memo'suz, taze closure'lar).
  - Etki: görünür tur sayısı × metin boyutuyla artan kare başı iş; uzun konuşmalarda belirgin.
  - TODO: blok kimliklerine göre memo'lanan `<Turn>` bileşeni (`sameActivity` `:2170`'teki desenle); `turnCopyText`'i tıklamada hesapla; `groupTurns`'ü memo'la.
  - Kabul: akışta yalnızca son tur commit etsin; kare başı scripting süresi 5→50 turda sabit kalsın.

- [x] **P30 — Akan markdown: ikinci RAF döngüsü, kelime başına span ve akış sonunda remount. [P1; yollar doğrulandı, Streamdown'ın delta başına parse maliyeti doğrulanmadı]**
  - **Durum (4 Eki):** Yapıldı — akış sonunda remount yok; fade yalnızca son blokta ve son ~320 ms'lik kelimelerde (`fade-wN` etiketleri). 393 test. **Gözle kontrol gerekli** (yalnızca happy-dom'da denendi); ikinci RAF döngüsü zaten değişmeyen karede render etmiyordu, dokunulmadı.
  - Kanıt: `src/features/sessions/ui/wordFade.tsx:83–96` (`usePacedText` kendi RAF + `rerender()`), `:151–183` + `AgentMarkdown.tsx:551–557` (her kelimeye `<span data-word-fade>` + 320 ms CSS animasyonu), `AgentMarkdown.tsx:610` (`key={fading ? "fade" : "plain"}` — fade bitince tüm Streamdown ağacı remount, tüm kod blokları Shiki ile yeniden boyanır).
  - Etki: akan mesaj kare başına iki kez render olabilir; DOM düğümü kelime sayısıyla büyür; uzun mesaj bitiminde tek seferlik uzun görev.
  - TODO: pacing'i harness flush tick'ine bağla; fade span'lerini son blokla sınırla; plugin listesini değiştirmek yerine plugin'i gösterilmiş metinde no-op yaparak remount'u kaldır.
  - Kabul: 3.000 kelimelik akışta akış sonunda long task yok; DOM düğüm sayısı kelimeyle ölçeklenmiyor; kare başına tek markdown render.

- [x] **P31 — `Composer` ve kardeşlerini akış karelerinden yalıt. [P2; yeniden render doğrulandı, Composer gövde maliyeti okunmadı]**
  - **Durum (4 Eki):** Yapıldı — `memo(Composer)`; tüm handler'lar ortak `useStableCallback` ile sabit; `stableBlocks` (yalnızca akan metin değiştiyse aynı referans) `ActivityDock`/`TranscriptFind`/`PromptOutline`'a gidiyor ve üçü de memo. tsc temiz; testler sonda çalıştırılacak. Profil alınmadı.
  - Kanıt: `src/features/sessions/ui/SessionPane.tsx:633–832` (memo'suz `Composer`'a ~35 inline closure), `:800` `ActivityDock`, `:1087` `TranscriptFind`, `:1101` `PromptOutline`, `:372–373` blok taramaları.
  - TODO: `memo(Composer)` + `session.id`'ye bağlı tek `useMemo` ile sabit handler'lar; `session.blocks` yerine türetilmiş primitifler geç.
  - Kabul: yalnızca metin akarken `Composer` commit etmesin.

- [x] **P32 — Shimmer'ı compositor'da çalışan veya düşük frekanslı efektle değiştir. [P1; animasyon doğrulandı, GPU payı ölçülmeli]**
  - **Durum (4 Eki):** Yapıldı — `steps(20)` ile saniyede 10–20 boyama + `prefers-reduced-motion`. Compositor-only sürüm mevcut markup ile mümkün değil. **Gözle kontrol gerekli** (bant daha kesik görünebilir); A/B ölçümü yapılmadı.
  - Kanıt: `src/styles/index.css:2146–2170`, `:2272–2279` — `background-clip: text` üzerinde `background-position` animasyonu, `linear infinite`; compositor'da çalışamaz. Kullanım: `AgentTranscript.tsx:1023`, `:1072`, `:2375`, `:2689`, `:3764`; `ActivityDock.tsx:189`; `ProjectRail.tsx:1394`.
  - Etki: herhangi bir ajan meşgulken, uzun tool çağrılarındaki token'sız boşluklar dahil, sürekli 60 Hz style/paint/raster.
  - TODO: `transform` animasyonlu overlay veya opacity pulse; ya da ~10 fps `steps()`; `document.hidden`'da durdur.
  - Kabul: token gelmeyen meşgul ajanda Performance panelinde kare başı Paint yok; shimmer açık/kapalı A/B ile GPU süreci CPU'su karşılaştırılsın.

- [x] **P33 — Kare başına tam transcript taramalarını ve `JSON.stringify`'ı kaldır. [P2; doğrulandı]**
  - **Durum (ikinci tur):** `hasPendingApproval` blok dizisi başına `WeakMap` ile hatırlanıyor (apply.ts'e dokunmadan); P27 + flush'taki atlama ile birlikte kare başı tarama kalmadı.
  - **Durum (4 Eki):** Kısmi — P27 sonrası `sessions`'a bağlı effect/memo'lar (snapshot `JSON.stringify`, dock badge, needs-input taramaları) metin karelerinde çalışmıyor; flush içindeki `syncDockBadge` de metin-only değişimde atlanıyor. **Açık:** `needsInput`'un `apply.ts` içinde artımlı izlenmesi.
  - Kanıt: `sessionNeedsInput`/`hasPendingApproval` (`session.ts:803–812`, her yüklü oturumun tüm blokları) — `syncDockBadge`'den iki kez, ayrıca `sessionHistory.ts:183` ve `AgentTranscript.tsx:324`; `App.tsx` `collectWorkspaceSnapshot` → `workspaceSnapshotKey` (`workspaceSnapshot.ts:257`, `JSON.stringify(snapshot)`) her flush'ta, yalnızca "değişmedi" demek için.
  - TODO: `needsInput`'u `apply.ts` içinde artımlı izle; snapshot effect'ini P27'deki sabit meta dilimine bağla.
  - Kabul: bu fonksiyonlar kare başı flame chart'tan kaybolsun.

- [x] **P34 — Akış karesi başına iki zorunlu senkron layout'u teke indir. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `[blocks, busy, visible]` layout effect'i kaldırıldı, tek `ResizeObserver` sabitliyor; padding cache'lendi. **Gözle kontrol gerekli**: akışta ve oturum değişiminde alta sabitleme.
  - Kanıt: `AgentTranscript.tsx:456–461` (`[blocks, busy, visible]` layout effect'i: `getComputedStyle` + `clientHeight` + `scrollHeight` oku, `scrollTop` yaz), `:463–485` (`ResizeObserver` aynısını tekrarlar), `:2257–2268`.
  - TODO: yalnızca `ResizeObserver`'dan sabitle; padding değerini cache'le.
  - Kabul: akışta trace'te "Forced reflow" uyarısı yok.

- [x] **P35 — `TerminalSpinner`'ı ortak ticker veya CSS `steps()` yap. [P3; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — tek ortak ticker (`useSyncExternalStore`), gizliyken durur. 4 test.
  - Kanıt: `src/features/sessions/ui/TerminalSpinner.tsx:23–29` — örnek başına 80 ms `setInterval` + `setState`, görünürlük kapısı yok; Sidebar, TitleBar, LiveAgentsPreview, transcript'te kullanılıyor.
  - Kabul: ajan çalışırken trace'te 80 ms timer yok.

- [ ] **P36 — Sohbet arka planı blur katmanlarını ölç; gerekiyorsa görseli bir kez ön-bulanıklaştır. [P3; doğrulanmadı — ölçülen makinede arka plan açık mı bilinmiyor]**
  - Kanıt: `src/styles/index.css:359–369`, `:372–436` (tam panel `filter: blur` + iki maskeli kopya); `SessionPane.tsx:846–851`.
  - Kabul: akış sırasında arka plan açık/kapalı GPU süreci CPU A/B'si.

---

## B — Native (Rust/Tauri)

- [x] **P37 — `session_upsert`: kilit altındaki git spawn'ını ve tam JSON turlarını kaldır. [P1; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı (1–2. adım) — git bilgisi kilitten önce; `json_eq` yerine SQLite'ta `blocks_json = ?` bayt karşılaştırması. 79 test. `RawValue` uygulanmadı (bloklar doğrulama/özet için okunuyor); blob hâlâ her seferinde tam yazılıyor. Kilit süresi ölçülmedi.
  - Kanıt: `src-tauri/src/session_store.rs:240–248` (kilit, sonra `upsert_session`), `:1357–1519`, `json_eq` `:2033–2038`; git bilgi cache TTL'i 3 s (`fs.rs:968–1003`); çağıran: `App.tsx` `LIVE_PERSIST_MS` 1,5 s, `sessionStore.ts:268`.
  - Etki: her upsert tek `SessionStore.conn` kilidini tutarken (a) cache miss'te 3'e kadar git süreci başlatır, (b) eski `blocks_json`'ı okuyup parse edip yalnızca `updated_at` kararı için derin karşılaştırır, (c) tüm blob'u yeniden yazar. 1 MB transcript için dört tam JSON geçişi + 1 MB yazı; liste/get, draft, kuyruk, notlar, otomasyonlar, `control_*` aynı kilitte bekler.
  - TODO: git bilgisini kilitten önce çöz; `json_eq` yerine saklı içerik hash'i; `blocks`'u `Box<RawValue>` al; uzun vadede blok başına satır veya delta ekleme. 3 Ekim P15 (frontend kuyruk birleştirme) ile birlikte ele al.
  - Kabul: 0,1/1/10 MB transcript'te `session_upsert` süresi ve kilit tutma süresi ölçülsün; kilit altında git süreci başlamasın.

- [x] **P38 — SQLite: `synchronous` kararı, okuma bağlantısı ve hazır ifade cache'i. [P2; doğrulandı, fsync gecikmesi ölçülmedi]**
  - **Durum (4 Eki):** Yapıldı — `synchronous=NORMAL`; liste/get okumaları ayrı salt okunur `list_conn` üzerinden; `list_by_project` git sorgusu kilit dışında. 81 test. `prepare_cached` yapılmadı (rusqlite `cache` özelliği/yeni crate ister). p50/p95 ölçülmedi.
  - Kanıt: `session_store.rs:47–60` — yalnızca `foreign_keys` + `journal_mode=WAL`; `synchronous` varsayılan FULL; `read_conn` yalnızca aramada kullanılıyor, diğer tüm okumalar yazma kilidinde.
  - Etki: her autocommit yazısı WAL fsync'i yapar (1,5 s'lik tam transcript yazısı dahil); okumalar WAL'ın izin verdiği eşzamanlılığı kullanmaz.
  - TODO: `PRAGMA synchronous=NORMAL` (**dayanıklılık kararı**: uygulama çökmesinde güvenli, elektrik kesintisinde son commit'ler kaybolabilir — bilinçli seçilmeli); salt okunur komutları okuma bağlantısına/küçük havuza yönlendir; sıcak ifadelerde `prepare_cached`.
  - Kabul: 5 MB upsert döngüsü çalışırken `session_list_by_project` p50/p95.

- [x] **P39 — Git poll'unda izlenmeyen dosyaları her 2 saniyede diskten okumayı bırak. [P1; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — izlenmeyen satır sayıları yol+boyut+mtime ile cache'leniyor, kök başına son görülen kümeyle sınırlı. Test var. Dosya sayısı üst sınırı eklenmedi (gösterilen sayıyı değiştirirdi).
  - Kanıt: `src-tauri/src/fs.rs:2596–2601` (`acc.untracked && count.additions == 0` → `text_line_count`), `:2731–2754` (dosya başına 1 MiB'a kadar tam okuma), `:2518–2532` (`--untracked-files=all`). Numstat izlenmeyenleri hiç listelemediği için koşul hep doğru.
  - Etki: ajan çok dosya ürettiğinde veya ignore edilmemiş çıktı klasöründe her tick N dosya okuması.
  - TODO: satır sayısını yol+boyut+mtime ile cache'le (`numstat_stamp` zaten stat ediyor); sayılan izlenmeyen dosya sayısına üst sınır.
  - Kabul: 500 izlenmeyen dosya, değişiklik yokken tick başına sıfır dosya okuması.

- [~] **P40 — Checkpoint: dosya başına git süreçlerini toplu çağrıya çevir, global kapıyı oturum bazlı yap. [P2; doğrulandı]**
  - **Durum (4 Eki):** Kısmi — `in_head` tek `git ls-tree` çağrısına toplandı (100 kirli dosyada 100 → 1 süreç), başıboş spawn'lar `git_cmd()` üzerinden. 25 test. **Açık:** `diff_numstat` hâlâ dosya başına süreç (depoda satır-diff uygulaması yok); kapı global kaldı (ortak çalışma ağacını koruyor, oturum bazlı yapmak geri alma verisini bozabilir).
  - Kanıt: `src-tauri/src/checkpoint.rs:33–43` (tüm oturumlar için tek `gate`), `ensure` `:49–87`, `capture` `:137–177`, `in_head` `:1157–1159` (yol başına `git cat-file -e`), `diff_numstat` `:1070–1085` (yol başına `git diff --no-index`); `:875` ve `:1070` `Command::new("git")` spawn kapısını ve doğrudan `git.exe` çözümünü atlıyor.
  - Etki: 200 kirli dosyalı ağaçta ilk turdan önce saniyeler; paralel ajanlar birbirini bekler.
  - TODO: `in_head` için tek `git ls-tree`/`cat-file --batch-check`; satır istatistiğini süreç içinde hesapla; kapıyı oturum başına yap; başıboş spawn'ları `git_cmd()` üzerinden geçir.
  - Kabul: 100 kirli dosyada `ensure` için git spawn sayısı sabit olsun.

- [x] **P41 — Harness stdout/SSE satırlarını toplu gönder. [P2; emit yolu doğrulandı, hız harness'e bağlı]**
  - **Durum (4 Eki):** Yapıldı — satırlar toplu olaylarla gidiyor (`harness-stdout-lines`, `harness-stderr-lines`, `harness-sse-batch`; 8 ms / 64 KiB / 512 satır, sessizlikten sonraki ilk satır hemen). Çıkış olayı okuyucuların boşalmasını ≤1 s bekliyor. Kod platformdan bağımsız. 41 Rust + 831 TS testi. Olay/s ölçülmedi.
  - Kanıt: `src-tauri/src/harness.rs:931–957`, `:1245–1277` — satır başına bir `app.emit`; PTY yolu tam bu nedenle birleştirilmiş (`pty.rs:20–22`).
  - Etki: token akışında oturum başına saniyede yüzlerce event, pencere sayısıyla çarpılır. 3 Ekim P18 "hangi pencereye" sorusunu kapsıyor; bu madde frekans.
  - TODO: 8–16 ms veya 64 KiB'lık dizi halinde tek event; ya da oturum başına `tauri::ipc::Channel`. P18 ile birlikte tasarla.
  - Kabul: uzun akışta event/s ve renderer CPU öncesi/sonrası.

- [x] **P42 — Ana thread'i bloklayan senkron komutları taşı. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `pty_spawn`, `control_save/load` async; Windows'ta `pty_kill` `taskkill` beklemesi blocking havuzda; `pty_write` terminal başına sıralı yazıcı thread'ine kuyruklanıyor; profil tespiti 30 s TTL cache. Yazıcı kuyruğu Unix'te de etkin.
  - Kanıt: `pty_kill` (`pty.rs:325–333`; Windows'ta `taskkill /T /F` bekler), `pty_spawn` (`:186–225`; her seferinde shell profili tespiti), `pty_write` (`:260–270`; bloklayan `write_all`), `control_save`/`control_load` (`control.rs:517–547`; 8 MB'a kadar JSON + P37 kilidi).
  - Etki: terminal kapatmada, takılmış programa yapıştırmada, orchestration kaydında 50 ms–saniyeler arası pencere donması.
  - TODO: `#[tauri::command(async)]`/`spawn_blocking`; terminal başına yazıcı thread + kanal ile sıra koru; `terminal_profiles::detect()` cache'le.
  - Kabul: terminal kapatma ve `cat`'e 1 MB yapıştırmada ana thread takılması ölçülsün.

- [ ] **P43 — `(async)` senkron komutların hangi thread havuzunda çalıştığını doğrula. [P3; doğrulanmadı]**
  - **Durum (4 Eki):** Doğrulandı, kod değişmedi — Tauri kaynağında (`tauri-macros` `wrapper.rs`, `ipc/mod.rs` `respond_async_serialized_inner`) `(async)` işaretli senkron komutların gövdesi `async_runtime::spawn` içinde, yani tokio worker thread'lerinde çalışıyor; bloklayan iş worker'ı park eder. Worker sayısı çekirdek sayısı kadar olduğundan ve P37/P38 kilit süresini kısalttığından ~100 komutu `spawn_blocking`'e taşımak şimdilik yapılmadı; kilit beklemesi ölçülürse yeniden değerlendirilmeli.
  - Kanıt: ~100 komut `#[tauri::command(async)] pub fn` (tüm `session_store.rs`, `automations.rs`, `notes.rs`, `harness_spawn`, `list_dir` …). Tauri 2'de bunların async runtime worker'larında çalıştığı varsayımı Tauri kaynağından teyit edilmedi.
  - TODO: önce teyit et; doğruysa store komutlarını `spawn_blocking` veya kanallı tek DB thread'ine taşı.
  - Kabul: arama + büyük upsert sırasında önemsiz bir async komutun gecikmesi.

- [x] **P44 — Windows git spawn kapısındaki N+1'leri azalt. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `list_dir` ignore sonucu klasör + girdi adlarıyla anahtarlı, 3 s TTL'li cache'ten geliyor (kapı yerinde). P37/P40 N+1'leri de giderildi. Kuyruk derinliği ölçülmedi.
  - Kanıt: `fs.rs:5127–5198` (her git süreci sıraya girer, 200 ms'ye kadar); `list_dir` başına `git check-ignore` (`:857–900`).
  - Not: kapı güvenlik yazılımı takılmalarına karşı bilinçli bir önlem; kaldırma. P37/P40 N+1'leri giderir; `list_dir` için ignore sonucunu klasör mtime'ıyla cache'le.
  - Kabul: Changes paneli açıkken ajan dosya düzenlerken kapı kuyruk derinliği/bekleme süresi.

- [x] **P45 — Windows PTY okuyucusunda okuma başına 8 ms uyku yerine zamanlı drain. [P2; kod doğrulandı, etkisi olası]**
  - **Durum (4 Eki):** Yapıldı — okuyucu thread + sınırlı kanal + zamanlı drain (`coalesce_chunks`); sessizlikten sonraki ilk chunk hemen gider, ≤125 emit/s. 6 test. base64/`emit_to` değişmedi. Süre ölçülmedi.
  - Kanıt: `pty.rs:538–552` (`thread::sleep(PTY_COALESCE)` sonra tek okumayı emit; koddaki yorum bunu bilinçli bir sınır olarak not ediyor), Unix yolu biriktiriyor (`:417–448`); çıktı base64 + `app.emit` ile tüm pencerelere (`:794–806`).
  - Etki: her yankıya +8 ms; ağır çıktıda verim tavanı; %33 base64 yükü.
  - TODO: okuyucu thread + `recv_timeout`'lu kanal; sahip pencereye `emit_to` veya ikili `Channel`.
  - Kabul: 20–50 MB dosya `cat` süresi ve tuş-yankı gecikmesi öncesi/sonrası.

- [x] **P46 — Arama index'ini artımlı güncelle. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — yalnızca değişen/yeni blokların FTS satırları yeniden yazılıyor (satırlar blok konumuyla anahtarlı; tam yeniden kurulumla eşdeğerlik testi var). Şema değişmedi. **Açık:** blob her index'lemede hâlâ tam parse ediliyor; meşgul oturumu atlama yapılmadı.
  - Kanıt: `src-tauri/src/session_store/content_search.rs:452–473`, `:493–514`, `:388–444` — `updated_at`'i değişen oturum baştan parse edilip tüm FTS satırları silinip eklenir, yazma bağlantısında; canlı oturum her aramada bayat; arama öncesi 1,5 s'ye kadar sync.
  - TODO: yalnızca son index'lenen bloktan sonrasını işle; meşgul oturumu durulana kadar atla.
  - Kabul: 5 MB'lık çalışan oturumla ilk sonuca kadar süre.

- [~] **P47 — Transcript'leri IPC'den çift işlemeden geçir. [P2; doğrulandı]**
  - **Durum (ikinci tur):** Kalan kısımlar incelendi, kod değişmedi: `read_file_base64` çağıranların dördü de gerçekten base64 metne ihtiyaç duyuyor; `control_save` parse ettiği değerin alanlarını okuyor.
  - **Durum (4 Eki):** Kısmi — `session_get` saklı `blocks`/`modelSettings` metnini parse etmeden yanıtın içine ekliyor (`tauri::ipc::Response`), geçerlilik `IgnoredAny` ile kontrol ediliyor. **Açık:** `SessionUpsert.blocks` (bloklar okunuyor, uygulanamaz), `control_save`, `read_file_base64`.
  - Kanıt: `get_session` (`session_store.rs:2192–2244`: blob → `Value` → yeniden serialize), `SessionUpsert.blocks: Value` (`:139`), `control_save` (`control.rs:525`), `read_file_base64` (`fs.rs:6816–6840`; ikili `Response` yolu `:6847`'de zaten var).
  - TODO: `RawValue` geçişi veya saklı byte'larla `tauri::ipc::Response`; eklerde `read_binary_file`.
  - Kabul: 10 MB oturumda `session_get` süresi ve tepe RSS.

- [x] **P48 — `list_project_files` payload'ını küçült. [P3; olası, ölçülmedi]**
  - **Durum (4 Eki):** Yapıldı — komut kökü bir kez, dosyaları göreli yolla gönderiyor; `listProjectFiles` aynı nesneleri yeniden kuruyor (uzak host dizisi aynen geçiyor). **Açık:** değişmeyen listeyi revision ile göndermeme.
  - Kanıt: `fs.rs:798–852`, `:907–955` — 20.000 girdiye kadar, her biri `name` + mutlak `path` + `relative`.
  - TODO: kök + göreli yollar; değişmeyen listeyi revision ile tekrar gönderme.

- [x] **P49 — Küçük native işler. [P3]**
  - **Durum (ikinci tur):** `sessions_recent_idx` ve `sessions_linked_idx` kısmi index'leri eklendi, sorgular `INDEXED BY` ile sabitlendi; `EXPLAIN QUERY PLAN` testi var.
  - **Durum (4 Eki):** Kısmi — ikili çözümü 30 s cache'leniyor (yalnızca eşleşme; "bulunamadı" kalıcı değil) ve `harness_http` tek agent paylaşıyor. **Açık:** `list_recent`/`list_linked` sorgu planı kontrolü.
  - Her spawn'da ikili çözümü: `harness.rs:873`, `:1319–1333`, `:2918–2967` — Windows'ta PATH'i dört uzantıyla yeniden yürür. Kısa TTL'li provider cache'i. (Doğrulandı.)
  - `harness_http` her çağrıda yeni `ureq` agent kuruyor (`harness.rs:1153`); yerel OpenCode sunucusuna keep-alive yok. Tek agent paylaş. (Doğrulandı; çağrı sıklığı ölçülmedi.)
  - `list_recent` tüm oturumları sıralıyor (`session_store.rs:1943`+); `list_linked` için `EXPLAIN QUERY PLAN` ile index kontrolü (`:1896–1908`). (Olası/doğrulanmadı.)

---

## C — Özellik panelleri

- [x] **P50 — "Tüm değişiklikler" diff'inde yalnızca değişen dosyayı yeniden yükle. [P1; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — yalnızca satırı değişen veya olayın adını verdiği dosya yeniden yükleniyor; aynı metinde önceki model korunuyor; model cache'i; 500 ms debounce. 655 test. **Açık:** gövdelerin tembel yüklenmesi; editör kaydı gibi yol bildirmeyen olaylar hâlâ tüm gövdeleri yeniden okuyor (ekran maliyeti yok).
  - **Durum (ikinci tur):** Gövdeler artık yalnızca açık ve ekrana yakın bölümler için yükleniyor (+ ilk 10 dosya); ekran dışı değişiklik çağrı üretmiyor.
  - Kanıt: `src/features/source-control/ui/WorkingTreeDiff.tsx:116–198` (`subscribeGitChanged(scheduleRun)`; her olayda `gitDiffFiles` + her dosya için `gitFileDiff`, 4'erli, dosya sınırı yok); yayıncı `GitChangesPanel.tsx:1914–1921`; backend `fs.rs:2756–2818`. Yeniden yüklenen dosya yeni `blocks` kimliği alır → `equalFileModel` (`UnifiedDiffView.tsx:546`) başarısız → yakın bölümler yeniden render + `highlightDiffFile` (`:386–395`). `models` yüklenen her dosyada yeniden kuruluyor: dosya sayısında O(N²).
  - Etki: ajan düzenlerken ~2 saniyede bir; dosya başına 1–2 `git cat-file` süreci + iki taraf tam metin (8 MiB'a kadar) IPC. Onlarca/yüzlerce değişen dosyada yüksek; Windows'ta süreç başlatma pahalı.
  - TODO: yalnızca index satırı değişen yolları yenile (poll zaten `changedFilePaths` hesaplıyor); gövdeleri açık/yakın bölümler için tembel yükle; metin aynıysa önceki `unified`'ı yeniden kullan; ~500 ms debounce.
  - Kabul: 200 değişen dosya + tek dosya düzenlemesinde tam bir `git_file_diff` çağrısı; başka bölüm yeniden boyanmasın.

- [x] **P51 — Tek değişiklik için tek `git status`. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `gitIndexStore.ts`: cwd başına tek in-flight istek ve 300 ms taze sonuç; kendi mutasyonlarımız geçersiz kılıyor.
  - Kanıt: `GitChangesPanel.tsx:1899–1921`; `src/features/source-control/hooks/useGitFileStatuses.ts:100–110`, `:137–143`; `WorkingTreeDiff.tsx:119` — panel, dosya ağacı durumu ve diff görünümü ayrı ayrı çağırıyor; durum hook'u yalnızca dosya listesi gerekirken tam `git_diff_index` istiyor.
  - TODO: cwd başına paylaşılan index store + in-flight dedup; dekorasyon için `git_diff_files`.
  - Kabul: tek dosya düzenlemesi tek `git status` süreci üretsin.

- [x] **P52 — Dosya ağacı: `siblings` hesabını kaldır, düğümleri memo'la, context'i böl, görünür satırları pencerele. [P1; doğrulandı]**
  - **Durum (ikinci tur):** Global `epoch` kalktı, her açık klasör kendi listesine abone; 300'den fazla girdili klasörde 200 girdi + "Show N more…". Tek düz sanal liste yapılmadı (gerek kalmadı).
  - **Durum (4 Eki):** Kısmi — `siblings` yalnızca yeniden adlandırmada; `memo(TreeNode)`; context state/actions olarak bölündü. 23 test. **Açık:** pencereli (sanal) liste; `epoch` global olduğu için bir klasör yenilemesi tüm açık klasörleri render ediyor.
  - Kanıt: `src/features/files/ui/FileTree.tsx:1127–1193` (`TreeNode` memo'suz, tek context: `selectedPath`, `dragOverPath`, `epoch`, `gitStatuses`), `:1191–1193` (`siblings` her render'da ebeveynin tüm girdilerinden kuruluyor, yalnızca yeniden adlandırmada kullanılıyor), `:895–896`, `:1069–1125`.
  - Etki: seçim tıklaması, sürükleme, epoch veya git durumu değişimi tüm düğümleri yeniden render eder; 2.000 girdili klasörde context değişimi başına ~4 milyon string işlemi. Uzak projelerde epoch 5 saniyede bir artar.
  - TODO: `siblings`'i yalnızca `editing` iken hesapla (tek satırlık hızlı kazanım); `memo(TreeNode)`; "ben seçili miyim/hedef miyim" aboneliği; düzleştirilmiş pencereli liste.
  - Kabul: 5.000 dosyalı klasörde seçim tıklaması iki satır render etsin, scripting < 16 ms.

- [x] **P53 — Editörde tuş başına tam belge kopyalarını kaldır. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — blok yokken ve dokunulan satırlarda (eski+yeni belge) işaretçi yoksa `toString()` atlanıyor; `onDocChange` yalnızca önizleme modunda. 338 test.
  - Kanıt: `src/features/files/editor/editorConflicts.ts:104–105`, `:139–143` (her transaction'da `doc.toString()`, yalnızca `<<<<<<<` aramak için); `src/features/files/ui/CodeMirrorEditor.tsx:514–516`; `FileEditor.tsx:76`, `:462–472`, `:496` (`setDraft` → kaynak modunda bile tuş başına `FileEditor` render).
  - Etki: küçük dosyada önemsiz; çok MB'lık dosyada (sınır 8 MiB) yazma gecikmesi.
  - TODO: önceki state'te blok yoksa ve eklenen metinde işaret yoksa conflict yeniden kurulumunu atla; `onDocChange`'i yalnızca önizleme görünürken bağla ve debounce et.
  - Kabul: 5 MB dosyada tuş profilinde `toString` yok; kaynak modunda `FileEditor` commit etmiyor.

- [x] **P54 — Terminal: tek decoder ve WebGL renderer. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — xterm OSC 7 parser hook'u (ikinci decode yok), yerel `Uint8Array.fromBase64`, `@xterm/addon-webgl` 0.19.0 (yalnızca görünürken, context kaybında DOM renderer). 81 test. **Gözle kontrol gerekli**: saydam/cam arka plan.
  - Kanıt: `src/features/terminal/ui/TerminalView.tsx:241–254` (her chunk için yeni `TextDecoder` + cwd taraması, sonra xterm tekrar decode eder; gizli terminallerde de), `:168–181` (base64'ü byte byte çözme); `package.json` yalnızca `@xterm/addon-fit` içeriyor → DOM renderer.
  - TODO: terminal başına tek akış decoder'ı veya xterm OSC 7 handler'ı; `@xterm/addon-webgl` + fallback. P45 ile birlikte ölç.
  - Kabul: 20 MB çıktı yazdırma süresi öncesi/sonrası.

- [x] **P55 — Dosya seçicide sıralamayı ertele ve top-K tut. [P3; olası, ölçülmedi]**
  - **Durum (4 Eki):** Yapıldı — sınırlı top-K seçim (eski sıralamayla aynı sonuç, oracle testi), `useDeferredValue`; Enter güncel sorguyu kullanır.
  - Kanıt: `src/features/files/model/fileIndex.ts:149–190`; `src/features/files/ui/FilePicker.tsx:138–140` — her tuşta tüm index puanlanır, her eşleşme yeni nesneye yayılır, `localeCompare` ile sıralanır; debounce yok.
  - TODO: `useDeferredValue`; tüm eşleşmeleri sıralamak yerine top-K heap; nesneleri yalnızca son 80 için kur.

---

## D — Host (3 Ekim listesinde olmayanlar)

- [x] **P56 — `adopted()` her poll'da tüm snapshot'ları `json_extract` ile taramasın. [P1; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `has_desktop/revision/updated_at/status` kolonları + kısmi index, transaction'lı migrasyon; `adopted()` snapshot'a dokunmuyor. Süre ölçülmedi.
  - Kanıt: `host/store.ts:161–184` — `WHERE json_extract(snapshot, '$.desktop') IS NOT NULL` + üç `json_extract`; her `sessions.list` (`server.ts:519`) ve `sessions.adopted` (`server.ts:673`) çağrısında. SQLite her satırın tüm transcript JSON'unu parse eder.
  - TODO: `desktop`/`revision`/`updated_at`/`status` için ayrı kolonlar (veya generated column + index); snapshot'a dokunmadan yanıtla.
  - Kabul: 50 oturum × 1 MB ile `sessions.list` süresi transcript boyutundan bağımsız olsun.

- [x] **P57 — Masaüstü DB'yi istek başına açmayı bırak. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — DB yolu başına salt okunur bağlantı cache'i (dosya kimliği ve `schema_version` kontrolü, 5 s boşta bırakma, hata sonrası tek yeniden deneme, kapanışta `close()`).
  - Kanıt: `host/desktopSessions.ts:79–95`, `:104`, `:196–220` — her çağrıda yeni `DatabaseSync` + `PRAGMA table_info`; `stamp()` her `sessions.sync`'te (`server.ts:221`, `:645`), yani izleyici başına 750 ms'de bir.
  - TODO: yol başına salt okunur bağlantı ve şema bilgisi cache'i; dosya değişiminde geçersiz kıl.

- [x] **P58 — `projectCwd()` yalnızca `cwd` için tüm `blocks_json`'ı yüklemesin. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `projectCwd()` blokları okumuyor.
  - Kanıt: `host/desktopSessions.ts:223–226` (`collect("id=?", [id])` bloklar açık); ardından `desktopSnapshot` (`server.ts:171–177`) tekrar okur → `sessions.get`/`delete`/adopt başına transcript iki kez okunur.

- [x] **P59 — Tur başında ek dosyaları event loop'ta senkron okuma. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `fs/promises.readFile` + `Promise.all`.
  - Kanıt: `host/engine.ts:1045–1054` — görsel başına 20 MB'a kadar `readFileSync(...).toString("base64")`; diğer tüm RPC'ler bekler.
  - TODO: `fs.promises.readFile` veya akış.

- [x] **P60 — `receipts` tablosuna temizlik ekle. [P3; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — `created_at` kolonu, 7 gün saklama; açılışta ve her 500 eklemede temizlik.
  - Kanıt: `host/store.ts:274–278` — komut başına satır eklenir, hiç silinmez.

- [x] **P61 — Host açılışında tüm snapshot'ları senkron parse etme. [P2; doğrulandı]**
  - **Durum (ikinci tur):** Açılış gereken alanları kolonlardan okuyor (`provider_session_id`, `harness`, `session_cwd`, `shell_running`), snapshot ilk erişimde yükleniyor; yalnızca yeniden yazılması gereken satırlar parse ediliyor.
  - **Durum (4 Eki):** Yapılmadı — engine açılışta her oturumun `shell.running`, `status`, `providerSessionId` alanlarına bakıyor; tembel yükleme daha büyük bir yeniden tasarım ister.
  - Kanıt: `host/engine.ts:316` + `host/store.ts:186–195` — constructor her oturumu `JSON.parse` eder, `desktop` alanı olmayanları tam yeniden yazar; açılış süresi toplam transcript boyutuyla ölçeklenir.
  - TODO: özet kolonlarından aç, snapshot'ı ilk erişimde yükle (P56'daki kolonlarla aynı iş).

---

## E — Build ve açılış

- [x] **P62 — `[profile.release]` ekle. [P2; doğrulandı]**
  - **Durum (4 Eki):** Yapıldı — kök `Cargo.toml`: `lto = "thin"`, `codegen-units = 1`, `strip = true`. **Release build alınmadı**; boyut/açılış ölçülmedi.
  - Kanıt: kök `Cargo.toml` ve `src-tauri/Cargo.toml`'da profil bölümü yok; `.cargo/config.toml` yok. Varsayılan: LTO yok, 16 codegen unit, strip yok.
  - TODO: workspace köküne `lto = "thin"`, `codegen-units = 1`, `strip = true`. **`panic = "abort"` ekleme**: kod zehirlenmiş kilit kurtarmaya (`unwrap_or_else(|e| e.into_inner())`) güveniyor ve P26 çökme yolu unwinding içeriyor.
  - Kabul: ikili boyutu, soğuk açılış ve 10 MB upsert mikro-benchmark'ı öncesi/sonrası. Derleme süresi artışı CI'da kabul edilebilir mi kontrol et.

- [~] **P63 — Açılış JS parçasını ölç ve böl. [P2; boyut doğrulandı, içerik dökümü yapılmadı]**
  - **Durum (ikinci tur):** Kısmi — döküm alındı (geçici Rollup eklentisiyle, bağımlılık eklenmeden). CodeMirror açılış parçasından çıkarıldı: kök artık `editorSearch` yerine `editorFindBridge.ts`'i import ediyor (editör kodu açılıştan 1,5 s sonra veya ilk kullanımda yükleniyor) ve `GitConflictCompare` tembel. Açılış parçası **2.670 KB → 2.258 KB**. **Açık:** kalan ağırlık çekirdek uygulama kodu (`sessions` 784 KB, `App.tsx` 377 KB, `harness` 365 KB, `shell` 356 KB, `parse5` 267 KB, `CHANGELOG.md?raw` 110 KB); `navigation-to-ui` süresi ölçülmedi.
  - Kanıt: mevcut `dist/` (4 Ekim 00:15 build'i): `import("./app/App")` karşılığı olan parça **2,7 MB** (Rollup onu yanıltıcı biçimde `mermaid-GHXKKRXX-*.js` olarak adlandırmış; gerçek mermaid çekirdeği ayrı 593 KB'lık tembel parça), + 428 KB ortak parça + 234 KB CSS. `vite.config.ts`'te `manualChunks` yok. View'lar (Settings, Inbox, Tasks, Automations, Notes, Search, terminal, PDF/DOCX/sheet, diff'ler) ve Shiki dilleri zaten tembel yükleniyor; ağırlık çekirdek uygulama kodu + Streamdown'da.
  - TODO: önce `rollup-plugin-visualizer` ile döküm al; sonra ilk ekranda gerekmeyen ağır modülleri (ör. orchestration, provider'a özel import/protokol kodu, nadir dialog'lar) `lazy` yap. `main.tsx`'teki `monocode:navigation-to-ui` ölçümü zaten var — onu baseline olarak kullan.
  - Kabul: soğuk açılışta `navigation-to-ui` süresi ve açılış parçası boyutu öncesi/sonrası.

- [ ] **P64 — Material ikon paketinin tamamının yüklenmesini kontrol et. [P3; olası]**
  - **Durum (4 Eki):** Yapılmayacak — paket tek dosyalık hazır bundle ve zaten ilk ihtiyaçta bir kez tembel yükleniyor; küçültmek paketi değiştirmeyi gerektirir.
  - Kanıt: `dist/assets/index.esm-*.js` **1,1 MB**, `react-material-icon-theme`'in tüm SVG'leri string olarak gömülü; tembel yükleniyor ama dosya ağacı açılır açılmaz tamamı iniyor/parse ediliyor.
  - TODO: yalnızca kullanılan ikonları import eden eşleme veya sprite/asset dosyaları.

---

## 3 Ekim listesindeki açık maddelerin güncel durumu

Çalışma ağacındaki koda göre yeniden kontrol edildi. Hiçbir kutu bayat değil.

| Madde | Durum | Kalan |
| --- | --- | --- |
| P05 | Kısmi | İstemci dedup/TTL tamam. Host hâlâ her `sessions.list`'te cwd başına `git symbolic-ref` başlatıyor (`host/server.ts:546–562`), `collect("1=1", …)` ile JS'te filtreliyor (`host/desktopSessions.ts:185`), conditional yanıt yok. |
| P06 | Açık | `connections.ts:662–675`, `:694` — sınırsız `Promise.all`, tek `failures` sayacı. |
| P07 | Açık | `probeMachines` her çağrıda kendi `environment.describe`'ını gönderiyor (`hostAutomationClient.ts:44–66`). |
| P08 | Açık | `TasksView.tsx:284–315`, `AutomationsView.tsx:272–287` — in-flight/generation/görünürlük koruması yok. |
| P09 | Açık | Heartbeat boşta da 1,5 s (`useDesktopLive.ts:38–72`); in-flight koruması ve 15 s makine kontrolü eklenmiş. |
| P10 | Açık | `syncClient.ts:377–383`, `:409–413` — makineler sırayla. |
| P12 | Açık | `useAdoptedSessions.ts:64`, `:100` — `known` snapshot verilmiyor; conflict'teki oturum her 5/20 s'de tam indiriliyor. |
| P14 | Açık | `host/engine.ts:493–502`, `host/store.ts:198–225` — 120 ms'de tam snapshot yazısı. |
| P15 | Açık | Bu listedeki P37 ile birlikte ele alınmalı. |
| P16 | Açık | `TerminalGridBackground.tsx:236`, `:327–350`; `ComposerRunner.tsx:221–234`, `:448–452`. |
| P17 | Açık | `TerminalView.tsx:414–448` — `active`/platform kapısı yok. |
| P18 | Açık | `harness.rs` hâlâ global `app.emit`; P41 ile birlikte. |
| P19 | Açık | `remote.rs:186–196` — tüm metodlar 30 s. |
| P22 | Açık | Makine hatası hâlâ `[]` dönüyor. |
| P23 | Kısmi | Kapalı oturum yolunda atomik CAS yok (`adoptedSessions.ts:212–229`). |
| P24 | Açık | Inbox 30 s force refresh, gizli/tray kapısı yok (`useInboxUnseen.ts:384`). Ortak sayaç bulunamadı (arama dar yapıldı; yokluğu kesin değil). |
| P25 | Değerlendirilemedi | 20 tekrar koşusu gerekiyor; test çalıştırılmadı. |
| P26 | Değerlendirilemedi | `open_new_window` hâlâ `spawn_blocking` içinde (`lib.rs:212–223`); Mac'te tekrar üretme gerekiyor. |

Tamamlandı işaretli P02, P03, P04, P11, P13, P20, P21 düzeltmeleri ağaçta mevcut (P13'teki "en fazla 2 indirme" sınırlayıcısı ayrıca bulunamadı; kontrol edilmeli).

## Kontrol edildi, sorun yok

Tekrar bakılmasın diye: delta uygulama ve yapısal paylaşım (`apply.ts:38–64`, `:797–843`); arka plan akışlarının 100 ms throttle'ı; `TranscriptBlock` memo'su; gizli sekme/transcript karşılaştırıcıları; transcript'in son 20 turla sınırlanması + `content-visibility: auto`; `persistFingerprint`; git poll'unun frontend tarafı (`sameIndex`, in-flight, gizliyken durma); diff görünümünde satır pencereleme ve sınırlı highlight; arama (200 ms debounce, iptal, 500 eşleşme sınırı); editör dil paketlerinin tembel yüklenmesi; terminal scrollback (5.000) ve resize; panel sürükleme (RAF + pointer-up commit); Inbox sayfalama; Rust `setup()` (ağır iş thread dışında); `fs.rs` git komutlarının `spawn_blocking` kullanması ve cache'leri; proje araması (`git grep` + sınırlı fallback); `provider_usage.rs` cache'i; Unix PTY birleştirme.

## Önerilen sıra

1. **Ölç:** tek akışlı oturumda React Profiler + Performance trace; shimmer A/B (P32). P27–P32 sıralamasını bununla kesinleştir.
2. **Hızlı kazanımlar (küçük, yalıtılmış):** P28, P32, P39, P52'nin `siblings` kısmı, P35, P62.
3. **Akış yolu:** P27 → P29 → P30 → P31 → P33/P34. P27 en büyük ama en riskli değişiklik; P28/P29 ondan önce bağımsız yapılabilir.
4. **Kayıt yolu:** P37 + P38 + 3 Ekim P15; hostta P56 + P61 + 3 Ekim P14.
5. **Git/diff:** P50, P51, P40, P44.
6. **Terminal ve IPC:** P45 + P54, P41 + 3 Ekim P18, P42, P47.
7. **Kalanlar:** P46, P53, P55, P57–P60, P63, P64, P43, P48, P49, P36.

## Doğrulama — 4 Ekim (geliştirmeler bittikten sonra tek koşu)

- **Windows, uygulama testleri (`npx vitest run`):** 6.018 geçti, 1 başarısız, 14 atlandı. Başarısız olan `src/app/shell/SidebarRemoteSessions.test.ts` › "says the machine did not answer instead of loading forever"; son commit'in (`c45b86dc`) temiz dışa aktarımında da başarısız, yani bu çalışmadan önce de kırıktı.
- **Windows, host testleri:** `npm run host:build` + `tsc -p host` + vitest: 255 geçti, 7 atlandı.
- **Windows, `cargo test -p monocode --lib`:** 670 geçti, 1 başarısız, 4 yok sayıldı. Başarısız olan `mcp::tests::discovers_provider_configs_without_exposing_credentials` bu makinede kurulu gerçek MCP sunucularını da buluyor; `mcp.rs` değişmedi.
- **macOS (Apple Silicon), `cargo test -p monocode --lib`:** 738 geçti, 2 başarısız. `git_commit_reports_signing_failure_with_hint` Türkçe dil ayarı yüzünden (İngilizce ayarla geçiyor); `every_listed_shell_runs_a_command` o makinedeki `csh` çıktısı yüzünden, kod yolu değişmedi.
- **Linux:** yerelde derlenemedi (WSL'de Rust/WebKit araçları yok). Linux'a özel koda dokunulmadı; doğrulama CI'a kalıyor.
- **Yapılmayanlar:** `tauri build`/release derlemesi, çalışan uygulamada deneme, React Profiler/Performance trace, clippy. Maddelerdeki **Kabul** ölçümlerinin hiçbiri alınmadı; kazanımlar koddan okunarak beklenen kazanımlardır.
- **Gözle kontrol gerekenler:** akışta ve oturum değişiminde alta sabitleme (P34), kelime fade efekti (P30), shimmer (P32), terminalin saydam arka planı WebGL ile (P54), ve P27 sonrası genel akış: yeni oturum, sekme kapatma, onay/soru bildirimi, pencere ayırma.

## Doğrulama — ikinci tur (3 Ekim listesinin açık maddeleri + kalanlar)

- **Windows, uygulama testleri:** 6.090 geçti, 1 başarısız (yine `SidebarRemoteSessions`; bu çalışmadan önce de kırık), 14 atlandı. İlk koşuda ikinci turun yeni kodunda 12 test başarısızdı; 11'i test kurulumu/eski beklenti, 1'i gerçek kod hatasıydı (`machineResults.ts`: başarılı boş cevaptan sonra "eski veri" uyarısı) ve düzeltildi.
- **Windows, host testleri:** 267 geçti, 7 atlandı, başarısız yok (ilk koşuda 3 başarısız; üçü de test hatası).
- **Windows, `cargo test -p monocode --lib`:** 678 geçti, 1 başarısız (aynı ortam kaynaklı MCP testi).
- **P25 tekrar koşusu:** `host/desktopSessions.test.ts` + `host/server.test.ts` art arda 20 kez: 20/20 geçti. Ancak `%TEMP%` altında 148 `monocode-*` test klasörü birikmiş; hangi koşulardan kaldığı ayrıştırılmadı, yani "geride klasör kalmasın" kabulü karşılanmadı.
- **macOS:** ikinci turda çalıştırılamadı — Mac'in diski doldu (650 MB boş). İkinci turda Unix'e özel tek değişiklik `pty_status` cevabındaki `supported: true` alanı.
- **Bundle değişikliği sonrası:** `src/features/source-control`, `src/app`, `src/features/files` testleri 999 geçti, 1 başarısız (aynı eski test).
- **Yapılmayanlar:** çalışan uygulamada deneme, release build, profil/ölçüm. Çoklu pencere yönlendirmesi (P18), host write-behind (P14) ve Zustand geçişi (P27) yalnızca testlerle doğrulandı.
