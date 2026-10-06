# v0.7.1 uyarlama uygulama kaydı

Tarih: 2026-10-06. Kaynak uygulaması tamamlandı. İlk kaynak/test doğrulaması ve kullanıcının sonraki isteğiyle yapılan paketleme/Mac kurulumu aşağıda ayrı kaydedilmiştir.

## Taban ve yaklaşım

- Upstream: [v0.7.1](https://github.com/hardbeat920/monocode/releases/tag/v0.7.1), `807c70e0d56fad77a83e98dad12cef0e4f3ef460`.
- Uygulama başlangıcı: temiz `29b57cd82e8af4dc40bb7b7f5a4690b2dbf75546`. Plan hazırlandıktan sonra ilerleyen yerel kaynak yeniden okundu.
- Üç uygulama ajanı kendi alanlarında çalıştı; ortak App, Sidebar, workspace ve tema entegrasyonu ana ajan tarafından yapıldı. Son cache yarışları ayrıca kaynak üzerinden bağımsız incelendi.
- Tüm dalı merge etmeden davranışlar yerel mimariye uyarlandı. Remote kimliği/host otoritesi, sayfalı geçmiş, taslak ve ekler, mesaj başına model ayarları, Git mutation kuyruğu, task worktree ve split diff korunacak taban olarak kullanıldı.
- Commit, push, sürüm yükseltme, uygulama/host kurma veya servis değiştirme yapılmadı.

## Kapsam kapanışı

Her satır kaynak uygulama kararını gösterir. Görsel ve gerçek cihaz kabulü aşağıda ayrıca açıktır.

| ID | Son karar ve uygulama | Kaynak / davranış kanıtı |
|---|---|---|
| U01 | Ekle: önceki soruya cevapları koruyarak dönme. | `QuestionForm.tsx`, `QuestionForm.test.ts` |
| U02 | Uyarla: review kaynak modu, normal Markdown/SVG tercihinden bağımsız. | `FileEditor.tsx`, `MarkdownModeToggle.tsx`, `MarkdownModeToggle.test.ts` |
| U03 | Uyarla: görünür model aramasına odak, mevcut picker kapanış sözleşmesi. | `ModelPicker.tsx`, `ModelFlyout.tsx`, `ModelPicker.test.ts` |
| U04 | Uyarla: uzun model etiketi ve kontrol alanları. | `Composer.tsx`, `ModelPicker.tsx` |
| U05 | Uyarla: explorer metin satırı harf altlarını kırpmaz. | `FileTree.tsx`; gerçek ölçekli ekran kontrolü açık |
| U06 | Uyarla: drop mevcut paste generation/read-flight yaşam döngüsünü kullanır. Send okumayı bekler; provider/reset değişiminde geç sonuçlar reddedilir. | `Composer.tsx`, `ComposerFileDropLifecycle.test.ts`, mevcut drop/attachment testleri |
| U07 | Ekle: klasör stage/unstage, mevcut seri Git kuyruğu ve diff invalidation ile. Per-file kuyruk korunur. | `GitChangesPanel.tsx`, `GitChangesPanel.test.ts`, Rust stage/unstage testleri |
| U08 | Koru + genişlet: literal Git yolları; unborn HEAD klasör unstage recursive olur. | `fs.rs`, `host/workspace.ts`, literal-path ve unborn HEAD testleri |
| U09 | Ekle: worktree arama ve mevcut HEAD üzerinden oluşturma; aynı tick çift oluşturma ve proje değişiminde stale navigation engeli. | `SidebarWorktreeSwitcher.tsx`, ilgili 14 test |
| U10 | Uyarla: canlı başlık/bağlı iş özeti görünüm metadata'sına yansır; partial-history kalıcılığı değişmez. | `sessionHistory.ts`, `sessionHistory.test.ts`, `AgentTranscript.tsx` |
| U11 | Koru + tamamla: local submit/steer state okumadan önce bekleyen harness olaylarını flush eder; remote routing korunur. | `App.tsx` submit/steer yolları; geniş web regression çalışması |
| U12 | Uyarla: yerel scroll/follow tabanı, resize ve anchor koruması. | `AgentTranscript.tsx`, `AgentTranscriptScroll.test.ts`, `composerResize.test.ts`, `useLockOverscroll.ts` |
| U13 | Uyarla: ilk paint öncesi tamamlanan yeni çıktı sınırlı reveal alır; kayıtlı/sayfalı geçmişte tekrar etmez. Yerel lag/backlog sınırları korunur. | `wordFade.tsx`, `wordFade.test.ts`, `AgentTranscriptPacing.test.ts`, `AgentTranscript.foldProse.test.ts` |
| U14 | Uyarla: Inbox kronolojik timeline, commit grupları, açıklama/yorum genişletme, PR özet/diff bağlantıları. | `InboxComments.tsx`, `InboxPrOverview.tsx`, ilgili yeni testler |
| U15 | Uyarla: hover/focus ön yükleme; kapsamlı cache/inflight paylaşımı ve bounded owner token. Scope değişimi/eviction/eski mutation engellenir; ilgisiz item invalidation geçerli sonucu bastırmaz. | `githubTasks.ts`, `githubWorkItemFreshness.test.ts`, `UserLinkPreview.test.ts`, repository/action testleri |
| U16 | Ekle: Default/Colorblind/High contrast paletleri ve +/- marker; mevcut tema/settings ve split diff korunur. | `appearance.ts`, `AppearanceSettings.tsx`, CSS, `UnifiedDiffView.markers.test.ts`, `editorGit.gutter.test.ts` |
| U17 | Uyarla: sidebar search/new başlığı; kapalı sidebar için mevcut titlebar erişimi korunur. | `Sidebar.tsx`, `TitleBar.tsx`, `TitleBarStatus.test.ts` |
| U18 | Uyarla: Quick Composer proje başlığı ve ayrı permission kontrolü; provider payload değişmez. | `QuickComposer.tsx`, `QuickModelSelector.tsx`, ilgili testler |
| U19 | Uyarla: canlı kalan kullanım; used/remaining tercihi korunur. | `UsageProviderChip.tsx`, `rateLimits.ts`, `PiUsage.test.ts`, `UsageProviderChip.test.ts` |
| U20 | Uyarla: alan daralınca diff sayaçlarının ölçeklenmesi. | `Sidebar.tsx` ResizeObserver; gerçek dar/geniş ekran kabulü açık |
| U21 | Ekle: taşan tab etiketi fade; observer temizliği. | `TabLabel.tsx`, `TabLabel.test.ts`, `TitleBar.tsx`, `SurfaceTabs.tsx` |
| U22 | Uyarla: transcript/composer ve sidebar alt fade/padding. | `SessionPane.tsx`, `AgentTranscript.tsx`, `Sidebar.tsx`, CSS |
| U23 | Uyarla: gerçekten yeni session giriş animasyonu; restore/reorder/proje açma tekrar etmez, bounded tracking ve cancellation cleanup. | `Sidebar.tsx`, `SidebarRename.test.ts`, remote sidebar testleri |
| U24 | Ekle: başlık particle sweep; hidden/unmount RAF temizliği ve reduced-motion. | `ParticleText.tsx`, `TitleBar.tsx`; gerçek cihaz görsel kabulü açık |
| U25 | Uyarla: yeni pane ve linked panel girişleri; hidden/reduced-motion, timer ve child animation-event koruması. | `PaneTree.tsx`, `PaneTreeEnter.test.ts`, Inbox/linked panel CSS |
| U26 | Uyarla: Pi extension modelleri; diğer flavor noExtensions davranışı korunur. | `piCatalog.ts`, `piCatalog.test.ts` |
| U27 | Uyarla: npm Pi launcher manifest/bin keşfi; Windows shim ve symlink, paket dışına kaçış kontrolü. | `host/process.ts`, `host/process.test.ts` |
| U28 | Ekle: GitLab /diffs yalnızca 404 için /changes fallback; auth/network hataları korunur, truncated/pagination yorumlanır. | `gitlab.rs`, 12 odaklı parser/fallback testi |
| U29 | Ekle: upstream contributors bağlantısı ve badge, fork bağlantılarını koruyarak. | `README.md` |
| U30 | Uyarla: davranış regression testleri; yerel token, reveal timing ve test mock sözleşmeleri korunur. | Aşağıdaki doğrulama kaydı |

## Yerel doğrulama

Ham loglar yerel, ignore edilen `.scratch/upstream-v071-validation/` klasöründedir; paylaşılan sonuç bu belgedir.

- `pnpm build`: TypeScript ve Vite üretim derlemesi geçti. Son cache düzeltmelerinden sonra tekrar doğrulandı. CSS `::highlight` optimizer ve büyük chunk uyarıları var.
- `pnpm exec tsc --noEmit -p host/tsconfig.json`: geçti.
- `cargo test --lib`: **712 geçti, 0 hata, 4 ignored**. Gerçek Git fixture testleri dahil, 179.45 saniye.
- Composer/transcript/model/soru alanı: **14 ayrı dosyada 169 test** başarılı; reveal timing sonrası fold-prose suite ayrıca **3/3** başarılı.
- Git/worktree/Markdown/Pi frontend odaklı kontrolleri: **35 test** başarılı. Host process/workspace: **16 başarılı, 2 platform skip**. Workspace Git commit fixture varsayılan 30 saniyede timeout aldı; aynı vaka 60 saniye sınırıyla 36.35 saniyede geçti. Kalıcı test timeout'u değiştirilmedi.
- Inbox/Quick Composer/usage odaklı ilk çalışma: **55 dosya, 506 test** başarılı. Son cache owner-isolation/action ve remaining-mode düzeltmelerinin kontrolü: **4 dosya, 32 test** başarılı.
- Pane/titlebar/TabLabel davranışları: **15 test** başarılı. Sidebar rename/remote odaklı kontrol: **70 test** başarılı. Ana ajan ilk diğer odaklı kontrolünde **175 test** çalıştırdı; ilk sidebar hataları düzeltildi ve ilgili suite tekrar geçti. Bu sayılar örtüşebilir; toplam gibi toplanmamalıdır.
- Geniş web çalışması: **617 test dosyası, 6620 test; 6595 başarılı, 11 hata, 14 pending**. Altı hata dosyasından beşinin değişen davranış/mock/cache/timing sorunları kapatılıp odaklı tekrar doğrulandı. Son tekrar `PiUsage`, freshness, fold-prose ve BranchPicker için **26/26** geçti; sessionWorkItem ayrıca başarılı. Geniş suite son düzeltmelerden sonra bütünüyle tekrar çalıştırılmadı.
- Kalan web hatası `ProjectGroups.test.ts`: değişmemiş test `bg-content/5` beklerken başlangıç HEAD'indeki değişmemiş grup JSX'i `bg-content/3` kullanıyor. İlgili elementin önce/sonra kodu aynı; bu çalışmada ProjectRail yalnızca iki diff renk tokenını değiştiriyor. İlgisiz görünüm/assertion değiştirilmedi.
- `git diff --check`: geçti.

`pnpm run check:rust` tamamen yeşil değildir: başlangıçtan kalan format sapmaları ve Clippy uyarıları kapıyı engelliyor. `cargo clippy --workspace --all-targets -- -D warnings` checkpoint (octal-looking escape/dead code), pty/remote (argument sayısı), rate_limits (büyük error), window_transfer (unwrap), skills (cloned ref) ve fs (needless borrow) bulguları verdi. Bu dosyalar başlangıçla karşılaştırıldı; değişen fs dosyasındaki işaretlenen ifade de başlangıçta aynen mevcut. İlgisiz toplu format/refactor yapılmadı. Bu açık kapı, başarılı Rust davranış testlerinden ayrıdır.

## Açık kabul sınırı

Windows/Retina Mac görsel smoke, gerçek native dosya/image drop, local/remote folder staging, iki host kopma/toparlanma, gerçek split/popout, ölçekli dar/geniş layout ve ölçümlü performans karşılaştırması yapılmadı. Unit ve kaynak kanıtları bu kabulün yerine geçmez; sayısal performans kazancı iddia edilmez.

## Sonraki paketleme ve MacBook kurulumu

Kullanıcının MacBook kurulumu ve Windows paket talebi üzerine ortak `scripts/update-local.ps1` koordinatörü kullanıldı. Sürüm değiştirilmedi: **0.9.1**.

- `-BuildOnly -Plan`, ardından `-BuildOnly`: iki makine aynı sabit kaynakla derlendi ve paketleri doğrulandı. Kaynak SHA-256: `84dcb3dc10085393029e9e4a1152f62d9725941d269b88e51aaa9a5f5c6eb831`; paket ID: `84dcb3dc10085393-local`.
- Windows host/web/native derlemesi ve NSIS/updater imzalı paket başarılı. Immutable kurulum dosyası: `C:\Users\kraba\.monocode-build\runs\84dcb3dc10085393-local\setup.exe` (12,219,361 byte); manifest checksum eşleşmesi ayrıca doğrulandı. Windows'ta bu paket için app/host kurulum yardımcısı başlatılmadı; kullanıcı uygulama installer'ını kendisi çalıştırabilir. EXE kurulumu ayrı host servisi güncellemesi değildir.
- `-Platforms mac -InstallOnly -Plan`, ardından `-Platforms mac -InstallOnly`: tekrar derlemeden Mac host ve app güncellendi. Son `-Status` iki bileşende de aynı ID için `installed` gösteriyor.
- `/Applications/MonoCode.app`: plist sürümü **0.9.1**, deep/strict codesign kontrolü başarılı, kurulu uygulama binary SHA-256'sı manifest ile aynı; uygulama süreci çalışıyor.
- Mac host runtime: `/Users/bahadryalcn/.monocode-host/runtime/0.9.1-darwin-arm64-84dcb3dc10085393-local`. Manifestteki 7 host payload dosyasının checksum'ı aynı; host süreci bu runtime'dan çalışıyor; host SQLite `quick_check` sonucu `ok`.
- Gerçek uygulamada iki mesaj sohbet ve görsel/etkileşim smoke yapılmadı. Kurulum/dosya/süreç doğrulaması bu kullanıcı davranışı kabulünden ayrıdır. Rollback ve veritabanı yedekleri ortak akış tarafından korundu.

### 0.9.11 paket yenilemesi

Kullanıcının sonraki isteğiyle yerel sürüm **0.9.11** yapıldı; commit/push/yayınlama yapılmadı. Aynı ortak koordinatörün `-Version 0.9.11 -BuildOnly` akışı kullanıldı.

İlk Windows denemesinde tamamlanmış eski host job kaydının PID'si yeni bir `conhost` sürecine verilmişti; sırf PID canlı olduğu için derleme yanlışlıkla engellendi. `scripts/local_update.py` artık `installed`/`failed` terminal kayıtlarını aktif yardımcı saymıyor. Tamamlanmamış işler için PID koruması sürüyor. `python -B scripts/test_local_update.py`: **21 test geçti**; terminal PID reuse ve unfinished job guard regression senaryoları dahil. Çalışan süreç öldürülmedi veya job kaydı silinmedi.

- Son paket ID: `21e7f43f02a5c5a5-local`; kaynak SHA-256: `21e7f43f02a5c5a5e3553d5017a877beb519222454ca002bcda29a942a58ccd8`.
- Windows ve Mac 0.9.11 app/host paketleri derlendi ve doğrulandı. Windows installer: `C:\Users\kraba\.monocode-build\runs\21e7f43f02a5c5a5-local\setup.exe`; manifest checksum eşleşti. Windows'ta yeni app/host kurulumu başlatılmadı.
- Mac `-Platforms mac -InstallOnly`: app ve host aynı son ID için `installed`. Kurulu plist **0.9.11**, app binary hash eşleşmesi ve deep/strict imza kontrolü başarılı.
- Mac host runtime `0.9.11-darwin-arm64-21e7f43f02a5c5a5-local`: 7 payload dosyası eşleşiyor, host bu runtime'dan çalışıyor, DB `quick_check=ok`.
- `git diff --check` geçti. Sürüm/paket yenilemesinde tüm ürün testleri yeniden çalıştırılmadı; önceki kaynak doğrulaması ve gerçek cihaz smoke sınırı geçerlidir.
