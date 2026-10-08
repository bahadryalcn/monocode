# Upstream 0.7.1 → 0.10.0 incelemesi

Tarih: 2026-10-08. Bu belge araştırma aşamasının envanteridir. Kullanıcının sonraki uygulama talebiyle başlatılan değişiklikler ve doğrulamalar [uygulama kaydında](upstream-v0.10.0-integration-evidence.md) tutulur; aşağıdaki kararlar kendi başına tamamlanma kanıtı değildir.

## İnceleme tabanı

- Bizim HEAD: `5ddf8d46`; `package.json` sürümü `0.9.13`. Bu bizim sürümümüzdür, upstream özellik kapsamını göstermez.
- Son kayıtlı upstream uyarlama: `6b301fa3`, kaynak `v0.7.1 / 807c70e0d56fad77a83e98dad12cef0e4f3ef460`. `docs/upstream-v0.7.1-integration-evidence.md` kaynak uygulama kaydını doğruluyor.
- İncelenen upstream: `v0.10.0 / a3f6f8a44b5f25bf712cbdaed1c831caa278d658`. Etiketin annotated-tag nesnesi `989a6f24` ile kaynak commit'i birbirinden ayrılmıştır.
- Aralık: **64 commit, 310 dosya, 45.720 ekleme / 3.056 silme**. Bu sayı merge/release commitleri, testler, lockfile ve yeni Mono modüllerini de içerir; 64 bağımsız özellik anlamına gelmez.
- GitHub release API üzerinden 0.8.0, 0.9.0 ve 0.10.0 notlarının **80 maddesi** okundu. Aşağıdaki envanter her maddeyi aynı sırayla karşılar. Bu aralıkta API'de görünen yayınlar bu üç sürümdür.
- Upstream kaynak etiketinin tamamı geçici dizine çıkarıldı; ilgili commit diffleri, testleri ve mevcut çalışma ağacı karşılaştırıldı. Mevcut staged/unstaged/untracked çalışmalar korunmuştur. Özellikle T3, HTML artifact, provider ve Git panelindeki devam eden işler araştırma tabanına dahildir; tamamlanmış/kurulmuş ürün kabulü değildir.

## Sonuç ve önerilen sıra

Tüm upstream dalını merge etmek uygun değil. Bizde host görevleri, goals/stewards, uzak oturumlar, provider hesapları, sayfalı geçmiş, docking, İmece kimliği ve yeni T3 özellikleri farklılaşmış durumda. Küçük düzeltmeler davranış olarak taşınmalı; Mono sistemi ayrı bir ürün özelliği olarak mevcut host sözleşmelerine uyarlanmalı.

| Sıra | Alınacak paket | Bizde görülen durum | Uyarlama ve kabul |
|---|---|---|---|
| 1 | Codex model seçilmeden başlatma | `codexProtocol.ts` hâlâ `collaborationMode.settings.model: input.model ?? null` gönderiyor. | `c2b479dd`: model bilinmiyorsa override gönderme; thread'in seçtiği modeli koru. Plan ve mevcut additionalDirs/skills sözleşmesini koruyan protokol testi. |
| 1 | Settings model kataloğu | `ProviderSettings.tsx:ProviderCliCard` yenilemeyi `models.length > 0` ile kesiyor; registry zaten `force` destekliyor. | `eb14d1a9` ve 0.10 dropdown davranışı: fallback listeyi canlı katalog sanma; kullanıcı dropdown açınca force refresh. Hesap kapsamlı cache/dedupe korunmalı. |
| 1 | Skill sınırı | `src-tauri/src/skills.rs:MAX_SKILLS = 300`. | `07f29c13`: 5.000 sınırı ve bounded discovery. Sadece sabiti yükseltmekten önce traversal/test farkını al. |
| 1 | Remote composer IME | Genel IME Enter koruması var; textarea hâlâ `defaultValue={initialDraft}` kullanıyor. | `680e1ab9`: mount başlangıcını sabitle; poll sırasında DOM text node değişmesin. WebKit IME kontrolü ayrı. |
| 1 | Notes autosave ve slug | Yerel NotesView boş başlığı trim/fallback yapıyor; title-focus koruması ve slug finalize yolu bulunmadı. Taslak kurtarma altyapımız mevcut. | `7eebfc17`, `bdc2b64c`: focus boyunca boşluk/boş draft korunur; blur/close sonrası başlığa uygun ilk slug. Mevcut recovery ve conflict handling bozulmamalı. |
| 1 | Terminal çalışma dizini | `onNewTerminalTab` hâlâ `gitCwd` kullanıyor; bu odaktaki dosya panelinin checkout'u olabilir. | `a6b4b1d0`: yeni terminal için aktif session worktree önceliği; silinmiş worktree dışlanır. Terminalin mevcut çalışma dizinini sonradan değiştirme. |
| 1 | Git Changes tıklama | ChangeRow düğmelerinde `h-full` yok; dosya açma yolu genel resolver'a gidiyor. Panelde devam eden staged değişiklikler var. | `6c677052`: tam satır hit area ve bilinen diff yolunu exact açma; stage/unstage/discard kuyruğu ve split diff korunmalı. |
| 2 | OpenCode 2.x | Yerel client'ta yeni protocol/service/v2-events katmanları yok. | `0eb2773e`: version detection, v1/v2 catalogs/events, approval/question/multi-select, compaction/cancel/resume; **local Rust + remote host birlikte**. Genel ACP desteği bunun eşdeğeri değildir. |
| 2 | Transcript scroll | 0.7.1 tabanında resize/anchor/follow koruması var; 0.10 gesture/pin ve browser testleri yeni. | `3e05e032`, `296d7fd0`, `b6e0db8d`: settled turn yüksekliği, directionless trackpad, küçük reversal, gecikmiş observer ve yeniden bağlama. Yerel pagination, pooled transcript ve scrollback restore korunmalı. |
| 2 | Stream/render/index performansı | Yerel `scheduleHarnessFlush` var; upstream yeni `HarnessEventQueue` ekliyor. Yerel local index hâlâ tek cache/inflight; remote index ayrı. | `0bfa5c61`: foreground/background bağımsız cadence, unchanged-turn WeakMap reuse, pane reuse ve checkout LRU. Remote bounded caches yerine geçirme; ölçüm ve davranış testleriyle uyarlama. |
| 2 | Codex asenkron sorular | Blocking soru paneli var; `codexAsyncQuestions` / async item delivery yolu bulunmadı. | `98da85ae`: non-blocking soruları ortak panelde göster, cevabı steer et; turn değişimi retry ve bitiş/cancel cleanup. |
| 2 | Geçici provider oturumları | Yerel Grok/OpenCode text yolu ve Codex text akışı yeni cleanup/ephemeral sözleşmelerini içermiyor; Codex text dosyasında devam eden Git-generation işi var. | `3e157b75`: success/error/cancel'da geçici oturumu sil; Grok UUID doğrula. Codex tek seferlik generation ephemeral, side-question resumable. Hesap ve retry sözleşmesini koru. |
| 2 | Explorer klavyesi | Mevcut handler copy/cut/paste/rename/delete yapıyor; arrow/Page/Home/typeahead akışı yok. | `bf5a30dc`: görünür satır sırası üzerinden gezinme; klasör aç/kapat, Enter/Space, harf döngüsü, focus outline. Remote explorer da korunmalı. |
| 3 | Pi küçük düzeltmeleri | Yerel protokolde statusKey güncelleme ve Copilot hidden-model filtresi yok. | `b74e803e`, `5aef8623`: aynı turn/key için tek status; boş metin kaldırır. Filtreyi yalnızca ilgili Copilot kataloglarına uygula. |
| 3 | Modal/diff/font/effort/native polish | Yerel modal panelde upstream z-index düzeltmesi yok; PR diff paleti zaten var. Diğerleri platform/görsel uyarlama adayı. | Küçük bağımsız parçalar; global tema/kimlik değişikliği yapma. Nerd Font sadece kurulu fontları fallback'le kullanır; font kurulumu sağlamaz. |
| Ayrı özellik | Kalıcı ajan + Soul/Memory/Habits | `src/features/monos` yok. Host görev/goals/automations altyapımız mevcut; birebir Mono yok. | UI ve hafıza fikrini al; zamanlamayı host otoritesine bağla. Yeni app-window timer'ını host scheduler yanında ikinci otorite olarak çalıştırma. |
| Ayrı özellik | Markdown belge artifacts | Bizde devam eden `HtmlArtifactSummary`/sandbox HTML sistemi var; upstream Markdown belge sistemidir. | Ortak tür/kimlik/authorization katmanı üzerinden document çeşidi ekle; HTML preview sandbox korunur. Tombstone/idempotency ve çok pencereli revision önemli. |
| Platform aşaması | Floating ajan + Codex özel store + updater | Floating Mono ve `codex_mono_store.rs` bizde yok; docking/hesap/update altyapımız farklı. | Kalıcı ajan tabanı oturduktan sonra; native platform ve migration doğrulaması gerektirir. Fork updater URL/imza/İmece kimliği ve local-update coordinator korunur. |

Önce 1. sıradaki küçük doğruluk düzeltmelerini, sonra 2. sıradaki provider/performance paketini almak en iyi fayda/kapsam dengesi. Mono ürünü bunları bekletmemeli.

## Eksiksiz yayın envanteri

Kararlar: **Al** = kaynakta açık eksik/uygulanabilir davranış; **Uyarla** = fikir yararlı, yerel sözleşmeye göre değişmeli; **Koru** = kaynakta mevcut eşdeğer; **Platform** = ilgili işletim sistemi/paketleme aşaması; **Test** = davranışla birlikte taşınacak doğrulama; **Değerlendir** = eşdeğerlik/native kabul için ilave odaklı inceleme gerekir. Bunlar uygulanmış veya runtime'da doğrulanmış değişiklikler değildir.

### 0.8.0 — 37 madde

Kaynak: [0.8.0 yayın notları](https://github.com/hardbeat920/monocode/releases/tag/v0.8.0), [0.7.1 → 0.8.0 kaynak farkı](https://github.com/hardbeat920/monocode/compare/v0.7.1...v0.8.0).

| ID | Gelen/değişen/düzelen davranış | Bizim kararımız |
|---|---|---|
| 08-01 | Kalıcı ajanlar: ayrı sohbet, atanmış projeler, isim/mascot/renk/background, sıralama ve restart sonrası dönüş. | Uyarla: İmece kimliğiyle ayrı özellik; piksel mascot'u zorunlu değil. |
| 08-02 | Details içinde model/projeler; Soul, Memory, Habits; `SOUL.md`; sohbet resetinde kalıcı profil korunur. | Uyarla: mevcut instruction/account kapsamıyla birleştir. |
| 08-03 | Tarihli hafıza, topic/archive, providerlar arasında süreklilik, eşzamanlı edit çatışması koruması ve yaygın credential redaction. | Uyarla: özellikle revision/draft koruması değerli; redaction tam secret güvenliği garantisi değildir. |
| 08-04 | Saatlik/günlük/hafta içi/haftalık yerel zamanlı Habits, pause/resume/run-now, son 20 sonuç; öneri kullanıcı başlatınca etkinleşir. | Uyarla: app açıkken çalışma sınırı upstream'e ait; bizim host scheduler'a bağla. |
| 08-05 | Ayrı background habit session, onaylar chat'te, tek çalışma, çok pencere claim, iki saati aşan gecikmeyi atlama ve stall sınırları. | Uyarla: host task claim/recovery otoritesi üzerinden. |
| 08-06 | Atanmış projelerde app CLI session/worktree/folder/notes işleri, background delegation ve toplu completion raporu. | Uyarla: app CLI bizde mevcut; yeni Mono batching kısmı ek iş. |
| 08-07 | Idempotent `notes.write`, başlık/body/tags ve kaynak session ilişkisi. | Koru/incele: bizde `notes.write` mevcut; creation retry eşdeğerliği ayrıca sınanmalı. |
| 08-08 | Canlı PR/session kartları, reply-choice ve habit önerileri; rapora kart ekleme. | Uyarla: mevcut PR watch/T3 paneliyle ortak bağlar. |
| 08-09 | Streaming sırasında follow-up outbox; sırayla teslim, hata retry, attachment kalıcılığı, quote draft, tüm chat'e drop. | Uyarla: mevcut composer/outbox'a ikinci bağımsız delivery sistemi kurma. |
| 08-10 | Kompakt çalışma özeti ve kronolojik activity paneli; onaylar erişilebilir, reply actions ve reduced motion. | Uyarla: mevcut transcript/activity bileşenleri üzerinden. |
| 08-11 | Limit sonrası manuel/reset-zamanında devam; model/provider/hesap değiştirme ve duplicate continuation engeli. | Uyarla: account izolasyonu ve mevcut usage recovery korunmalı. |
| 08-12 | Tam transcript saklama, eski sayfalar ve arama; bounded brief ile provider context yenileme. | Uyarla: yerel paging/handoff tabanı var; idle/restart rotasyonu 0.10'da kaldırılmıştır. |
| 08-13 | Codex asenkron soruları ortak panelde; cevap steer, turn yarışı retry, bitişte cleanup. | Al: blocking soru desteğinin üzerine async yol. |
| 08-14 | Görünür output RAF; gizli/background output ayrı yavaş cadence; tab dönüşünde catch-up. | Uyarla: yerelde temel scheduler var; upstream queue ayrımı yeni. |
| 08-15 | Worktree index cache tab değişiminde korunur, dönüşte refresh; gizli Explorer state kalır. | Uyarla: local LRU ve remote cache birlikte. |
| 08-16 | Değişmeyen turn/pane render reuse; jump görünürlüğü history'yi rerender etmez. | Uyarla: yerel memoization üstüne ölçülü iyileştirme. |
| 08-17 | GitHub Inbox 2 dk görünür / 5 dk gizli polling, 2 dk cache; linked badge reuse ve focus dedupe. | Koru/karşılaştır: bizde GitHub read-gate/cache/polling çalışması mevcut; süreleri körlemesine değiştirme. |
| 08-18 | PR checks ilk açılışta gelir; periyodik polling yalnızca Checks tab görünürken. | Değerlendir: yerel polling lifecycle'ına bu koşulu eklemek yararlı. |
| 08-19 | Notes/Soul için ortak highlighted Markdown kaynak editörü. | Koru + genişlet: bizde NoteMarkdownEditor var, Soul henüz yok. |
| 08-20 | Hafıza çatışması, paging/search, habits, delivery, usage, async soru/native/performance regression kapsamı. | Test: alınan davranışlarla taşınır. |
| 08-21 | Gecikmiş scroll event/resize/observer streaming sırasında okuma konumunu bozmaz; yukarı hareket follow'u durdurur. | Uyarla: 0.10'daki son politikayı esas al. |
| 08-22 | Not başlığında focus boyunca boş/boşluk draft korunur, normalization blur/teardown'da. | Al: mevcut taslak kurtarmaya uyarlama. |
| 08-23 | Remote polling WebKit IME composition'ı bozmaz, aday seçen Enter mesaj göndermez. | Al: mountDraft düzeltmesi eksik; Enter koruması tek başına yeterli değil. |
| 08-24 | Yeni terminal aktif session worktree'sinde açılır; silinmiş worktree yok sayılır. | Al: mevcut gitCwd önceliğini terminale özel çözümle. |
| 08-25 | JetBrainsMono Nerd Font Mono ve Nerd fallback; production CSS'de stack korunur. | Değerlendir: yerel seçilmiş font tercihini koruyan fallback. |
| 08-26 | Skill catalog cap 300 → 5.000. | Al: bizde hâlâ 300. |
| 08-27 | Pi extension status aynı key için tek satır; boş metin siler, yeni turn sıfırlar. | Al: append birikimini azaltır. |
| 08-28 | Pi/omp Copilot kataloglarında internal ve legacy modelleri gizleme. | Al: ilgili provider kapsamına sınırlı. |
| 08-29 | macOS resize boyunca native glass tint; renk/opaklık sync ve CSS fallback; çift tint engeli. | Platform: mevcut native window/docking ile ekran doğrulaması. |
| 08-30 | Modal panel backdrop üstünde; light theme solid background ve başlık düzeni. | Al/Uyarla: stacking düzeltmesi açık aday, stil mevcut tasarıma göre. |
| 08-31 | Uzak makinede klasör açma dialog'u tüm pencereyi karartmaz; dışarı tıklayarak kapanır. | Uyarla: yerel folder picker/native drive akışını koru. |
| 08-32 | Editor diff marker line number ile kod arasında; eski numaralar ve tek renk ipucu. | Uyarla: yerel accessibility palette/split diff korunmalı. |
| 08-33 | Inbox PR sayaç/bar renkleri seçilmiş diff paletine uyar. | Koru: yerel `InboxPrOverview.tsx` diff tokenlarını kullanıyor. |
| 08-34 | GitHub primary/secondary limit backoff; son snapshot korunur, diğer providerlar devam eder. | Koru: mevcut GitHub read-gate ve cache yaklaşımıyla karşılanıyor. |
| 08-35 | Tükenmiş provider'dan yeniden özet istemeden kayıtlı recap ile switch; yeni hesapta yeni thread. | Uyarla: provider/account geçişi ve bounded handoff ile ortaklaştır. |
| 08-36 | Hazırlanan/silinmiş worktree'ye queued mesaj dispatch edilmez. | Değerlendir: yerel task/queue yollarının tümünde eşdeğerlik kontrolü; Mono yolu ayrı. |
| 08-37 | app CLI yalnızca aynı projede source worktree mirası verir; explicit worktree hedef projeye doğrulanır. | Uyarla: mevcut app CLI ve remote/host ownership korunmalı. |

### 0.9.0 — 20 madde

Kaynak: [0.9.0 yayın notları](https://github.com/hardbeat920/monocode/releases/tag/v0.9.0), [0.8.0 → 0.9.0 kaynak farkı](https://github.com/hardbeat920/monocode/compare/v0.8.0...v0.9.0).

| ID | Gelen/değişen/düzelen davranış | Bizim kararımız |
|---|---|---|
| 09-01 | Kalıcı Markdown document artifact, reply altı kart, reader/file links/copy/delete ve revision refresh. | Uyarla: mevcut HTML artifact'tan farklı tür, ortak metadata. |
| 09-02 | `artifacts.list/read/write`, chat/habit attachment; creation retry idempotency, silineni başka pencere geri getiremez. | Uyarla: tombstone ve revision davranışları özellikle alınmalı. |
| 09-03 | macOS menüden always-on-top, resizable, Spaces arasında floating chat; mesaj/attachment/onay/soru/stop. | Platform: mevcut çok pencere/docking ownership ile. |
| 09-04 | Mono başına permission saklama; yeni Mono varsayılanı Auto. | Uyarla: permission picker yararlı; Auto varsayılanını ürün politikası kararı olmadan kopyalama. |
| 09-05 | Reply Sessions paneli: provider/model/proje/status, input/draft/archive ve restart sonrası launch history. | Uyarla: mevcut task/session bağlantılarıyla ortaklaştır. |
| 09-06 | Mono'nun başlattığı session'lar için sidebar görünürlük tercihi; gizlenen kayıtlar korunur. | Uyarla: host task session görünürlüğüyle tutarlı. |
| 09-07 | `sessions.stop/archive/delete`; queued pause; archive status; dosya/terminal/worktree korunur. | Uyarla: mevcut local+host session lifecycle'ına bağla; API yetki kapsamını koru. |
| 09-08 | Kaydedilmiş tercihi olmayan hesap email'leri varsayılan masked. | Koru: yerel `MASK_EMAILS_DEFAULT = true`. |
| 09-09 | Açılış ve progress activity trail'de; final answer ayrı; copy/save final metni kullanır. | Uyarla: transcript semantics ve mevcut provider event ayrımı. |
| 09-10 | Delegation sonucu aynı reply'ı sürdürür; bir saat/gün farkında yeni timestamp/message. | Uyarla: completion batching ve persisted message ID'leriyle. |
| 09-11 | Max/Ultra animasyonu bu seçenekleri sunan tüm providerlarda, klavye highlight dahil. | Değerlendir: mevcut decorativeMotion/reduced-motion tercihini koru. |
| 09-12 | Artifact/floating/permission/session-history/lifecycle/completion regression testleri. | Test: ilgili feature ile. |
| 09-13 | Host integration suite tüm platformlarda serial ve uzun timeout; teardown/load yarışları azalır. | Al: bizde serial/30s yalnızca Windows'ta; macOS/Linux CI için yararlı. |
| 09-14 | Teslim edilmiş mid-turn follow-up cevabı hemen görünür; queued/failed teslim sayılmaz, yeni tool işi cevabı gizlemez. | Uyarla: Mono delivery modeliyle; normal chat'e kör UI aktarımı yapma. |
| 09-15 | Completion launch acceptance bekler; erken finish kaybolmaz; reject duplicate rapor üretmez; stop/archive/delete hedef raporu temizler. | Uyarla: host task/pr-watch rapor yaşam döngüsüne de yararlı. |
| 09-16 | Mono/name/memory/habit girişlerinde WebKit IME aday Enter'ı submit etmez. | Alınacak feature ile: ortak IME helper'ı yeniden kullan. |
| 09-17 | Codex model seçilmediyse collaboration override gönderilmez; null-model hatası kalkar. | Al: mevcut protokolde açık eksik. |
| 09-18 | Başlıksız not ilk gerçek başlığını alınca slug finalize olur; stale edit iptal; mevcut/özel slug sabit kalır. | Al: kaynakta finalize yolu eksik. |
| 09-19 | Dock odaktayken Ctrl/Cmd+W terminal kapatır, +T terminal ekler; macOS menüler yalnız odaklı pencereye gider. | Değerlendir/Uyarla: yerel terminal shortcut sözleşmeleriyle karşılaştır; mevcut window routing korunmalı. |
| 09-20 | Fallback modeller bulunsa da Settings canlı katalog yükler; Pi/Antigravity restart sonrası bayat liste düzelir. | Al: yerel length guard hatalı. |

### 0.10.0 — 23 madde

Kaynak: [0.10.0 yayın notları](https://github.com/hardbeat920/monocode/releases/tag/v0.10.0), [0.9.0 → 0.10.0 kaynak farkı](https://github.com/hardbeat920/monocode/compare/v0.9.0...v0.10.0).

| ID | Gelen/değişen/düzelen davranış | Bizim kararımız |
|---|---|---|
| 10-01 | Floating chat'te ajan değiştirme/yeni ajan rail'i ve macOS menüyle selection sync. | Platform: floating feature sonrası. |
| 10-02 | Floating chat'te animated artifact sheet ve aynı reader/file links. | Platform: ortak document reader ile. |
| 10-03 | macOS Mono menü ikonu show/hide ayarı, restart sonrası kalıcı. | Platform: Settings'ten keşfedilebilir recovery gerekli. |
| 10-04 | Explorer arrow/Home/End/PageUp/PageDown, folder enter/collapse, Enter/Space, prefix search/letter cycling, focus outline. | Al: mevcut explorer bunları içermiyor. |
| 10-05 | Live ticker üzerinden current-turn activity expand/collapse; klavye ve expanded state. | Uyarla: mevcut activity yüzeyine erişilebilir kontrol. |
| 10-06 | OpenCode 1.x/2.x version-aware server/catalog/events; approval/question/multi-select/compact/cancel/project resume. | Al: local ve remote transport birlikte. |
| 10-07 | İmzalı AppImage self-update; writable path/relaunch; deb/rpm paket yöneticisi talimatları; AppImage olmayan feed doğru no-update. | Platform: fork release altyapısına uyarlama. |
| 10-08 | macOS composer native spellcheck ve context-menu suggestions; mevcut OS tercihleri korunur. | Platform: yerelde spellCheck=false; Windows/Türkçe davranışı ayrıca ürün kararı. |
| 10-09 | Codex Mono için hesap kapsamlı özel store; config/auth paylaşımı; rollout/fork/delegated-agent state migration. | Uyarla: Mono gelirse native context sürekliliği için; normal Codex session deposunu taşımak değildir. |
| 10-10 | Provider session rotation yalnız raporlanan context %80 olduğunda; idle/restart tetiklemez, recent exchanges + bounded brief taşınır. | Uyarla: son politikayı al; tüm normal session'lara global %80 restart uygulama. |
| 10-11 | Habits çalışma limiti 15 dk → 1 saat; approval bekleme çalışma süresinden düşer, overdue failure sürer. | Uyarla: host task budget/approval süreleriyle tek sözleşme. |
| 10-12 | Aktif ajan adı signature pill, settled reply adı muted, floating rail inactive dim. | Değerlendir: mevcut görsel kimliğe uygun polish. |
| 10-13 | macOS menü system-style row/hover/SF Symbols ve destructive red. | Platform: floating menü sonrası. |
| 10-14 | Zen phase live scrollbar gizli; scroll korunur. | Değerlendir: yerel erişilebilirlik ve scroll discoverability. |
| 10-15 | Ayrı beta updater feed; stable/macOS linkleri korunur; repack sonrası AppImage signing; bounded APT retries. | Platform: değerli release güvenilirliği; fork feed/key'leriyle. |
| 10-16 | Chromium/WebKit scroll testleri, floating/artifacts/keyboard/habits/remote/store/cleanup/OpenCode/channel coverage ve AppImage CI; geçici debug/mockup kaldırılmış. | Test: davranış odaklı coverage al; repo temizliği bizde karşılık varsa ayrı inceleme. |
| 10-17 | Settled history scroll range sabit; küçük reversal follow'u açmaz; directionless trackpad snap yapmaz; reattach stale offset'e dönmez. | Uyarla: browser fixtures özellikle değerli, yerel history restore sözleşmesini koru. |
| 10-18 | Yerel proje açmak remote tab'ı blank sanıp tüketmez; remote reuse yalnız aynı proje, transcript yüklenirken de. | Koru + Test: bizde remote/pending guard ve proje eşleşmeli helper var; yeni restore senaryolarını eklemek yararlı. |
| 10-19 | Changes full-height tıklama ve known exact diff path; gereksiz resolution isteği yok. | Al: panel ve file-open zinciri birlikte. |
| 10-20 | Settings dropdown açılınca canlı cache olsa da catalog force refresh. | Al: registry force zaten mevcut, UI tetiklemesi eksik. |
| 10-21 | AppImage host WebKitGTK 4.1/system libs; bundled Ubuntu EGL/Mesa hatasını engeller, native Wayland ve x11 fallback. | Platform: Linux yayınlarsak yüksek değer; Windows düzeltmesi değil. |
| 10-22 | Windows Codex özel store junction canonical source; copied rollout flush öncesi write access. | Yeni store ile birlikte al: mevcut normal storage'a bağımsız uygulanmaz. |
| 10-23 | Grok/OpenCode geçici generation cleanup her sonuçta; Codex generation unsaved, side-question resumable; Grok UUID kontrolü. | Al/Uyarla: hesap/retry/current Git-generation değişiklikleri korunmalı. |

## Büyük özelliklerin entegrasyon sınırları

1. **Kalıcı ajan:** profil/atanmış proje/Soul/Memory/transcript lifecycle'ını UI ve host protokolünde tanımla. Hesap değişimi native context'i aynı hesapmış gibi kullanmamalı. Upstream özellik adı ile bizim ürün kimliğini topluca değiştirme.
2. **Zamanlama:** app açıkken çalışan Mono Habits mekanizması, bizim host görev planlayıcısının yerine geçmez. Tek claim/run/recovery otoritesi; timezone/DST, duplicate multi-window run, missed schedule, approval wait, stop ve restart ayrı acceptance maddeleri.
3. **Belgeler:** upstream Markdown store ile bizim sandbox HTML store eşdeğer değil. Bir artifact abstraction içinde iki içerik türü; authorization/session ilişkilendirme, idempotency, revision, deletion tombstones ve cache invalidation ortak olmalı.
4. **Codex özel store:** yalnız kalıcı ajan use case'i için düşün. Hesap config/auth bağlantıları, Windows junction, rollout dependency/fork ve agent-edge migration'ı veri kaybına hassas. Migration rollback ve fixture'lar olmadan genel session storage'a taşıma.
5. **Native floating:** mevcut cross-window docking/saved tabs/process ownership korunmalı. macOS Spaces, focus/menu target, always-on-top ve approval input görsel/native doğrulama ister; Windows'a birebir macOS menu bar port'u sayılmaz.
6. **Release:** MIT kaynak yeniden kullanımına izin verir; upstream copyright/license notice korunur. Yeni Rust/transitive bağımlılıklar ayrı kontrol edilir. Upstream npm lock/build/update URL'leri bizim pnpm 12 ve shared local-update pipeline'ını değiştirmek için gerekçe değildir.

## Doğrulama durumu

Bu çalışma **kaynak karşılaştırmasıdır**. Release notlarındaki “Fixed” upstream iddiasıdır; upstream test dosyaları incelenmiş olması bizim uygulamada testlerin geçtiği anlamına gelmez. Kod değişmediğinden test/build çalıştırılmadı. İleri uyarlamada her paket için anlamlı focused test bir kez; ardından ilgili local/remote provider ve native kabul gerekir. Özellikle browser scroll testi Windows/Mac kurulu Tauri webview testinin tamamı değildir.

Küçük düzeltmelerin uygulanması için eksik kullanıcı bilgisi yok. Büyük feature'ların seçimleri ürün kapsamı kararıdır; bu araştırma uygulama yetkisi olarak yorumlanmadı.

## İncelenen commit envanteri

Aşağıdaki liste sabit `v0.7.1..v0.10.0` aralığından otomatik çıkarılır; release/merge commitleri dahil 64 kayıt. Kaynak aralığı: [GitHub compare](https://github.com/hardbeat920/monocode/compare/v0.7.1...v0.10.0).

- [a3f6f8a4](https://github.com/hardbeat920/monocode/commit/a3f6f8a4) Release v0.10.0
- [43602cde](https://github.com/hardbeat920/monocode/commit/43602cde) Make the live activity ticker expandable
- [b93b95a4](https://github.com/hardbeat920/monocode/commit/b93b95a4) Preserve remote sessions when opening local projects
- [8a63eb69](https://github.com/hardbeat920/monocode/commit/8a63eb69) Tone down settled turn agent names
- [eb5f69a5](https://github.com/hardbeat920/monocode/commit/eb5f69a5) Allow mono habits to run for up to one hour
- [bf5a30dc](https://github.com/hardbeat920/monocode/commit/bf5a30dc) Add keyboard navigation to the file tree
- [322fc2a0](https://github.com/hardbeat920/monocode/commit/322fc2a0) Fix Windows Codex directory junction creation
- [0b2c391f](https://github.com/hardbeat920/monocode/commit/0b2c391f) Fix Windows path links and file syncing
- [004cab5b](https://github.com/hardbeat920/monocode/commit/004cab5b) Add isolated Codex mono storage and rollout persistence
- [daaad71c](https://github.com/hardbeat920/monocode/commit/daaad71c) Hide scrollbars in Zen phase live content
- [3e157b75](https://github.com/hardbeat920/monocode/commit/3e157b75) Clean up temporary provider sessions
- [e92d8038](https://github.com/hardbeat920/monocode/commit/e92d8038) Keep Mono Codex sessions ephemeral and rotate by context
- [09238465](https://github.com/hardbeat920/monocode/commit/09238465) Merge branch 'main' of https://github.com/hardbeat920/monocode
- [514400dc](https://github.com/hardbeat920/monocode/commit/514400dc) Enable native macOS spell checking in chat composer (#829)
- [bbb91627](https://github.com/hardbeat920/monocode/commit/bbb91627) Wrap active agent names in signature pills
- [b6e0db8d](https://github.com/hardbeat920/monocode/commit/b6e0db8d) Stabilize transcript scroll pinning and settled Mono turn headers
- [6c677052](https://github.com/hardbeat920/monocode/commit/6c677052) Fix Changes list file selection click target and latency (#830)
- [0eb2773e](https://github.com/hardbeat920/monocode/commit/0eb2773e) feat(opencode): support OpenCode 2.x servers (#434)
- [b9e2a13f](https://github.com/hardbeat920/monocode/commit/b9e2a13f) Self-update the Linux AppImage (#825)
- [296d7fd0](https://github.com/hardbeat920/monocode/commit/296d7fd0) Stabilize chat history scrolling and add browser regression coverage (#818)
- [de9650ce](https://github.com/hardbeat920/monocode/commit/de9650ce) Use host WebKitGTK in the Linux AppImage (#824)
- [1c532697](https://github.com/hardbeat920/monocode/commit/1c532697) Add artifact sheet overlay in floating Mono chat
- [c0d1fa0d](https://github.com/hardbeat920/monocode/commit/c0d1fa0d) Add menu bar icon visibility toggle
- [11b53974](https://github.com/hardbeat920/monocode/commit/11b53974) Add Mono rail to floating chats for switching and creating
- [0ee745e9](https://github.com/hardbeat920/monocode/commit/0ee745e9) Remove accidental document preview mockup
- [9a7b6a25](https://github.com/hardbeat920/monocode/commit/9a7b6a25) Release v0.9.0
- [4d24fd7e](https://github.com/hardbeat920/monocode/commit/4d24fd7e) Add persisted artifacts with chat attachments and panels
- [88994864](https://github.com/hardbeat920/monocode/commit/88994864) Default to masking account emails
- [eb14d1a9](https://github.com/hardbeat920/monocode/commit/eb14d1a9) Fix Settings catalog refresh behind fallback models (#783)
- [3597485c](https://github.com/hardbeat920/monocode/commit/3597485c) Route ⌘W and ⌘T to the focused project terminal (#774)
- [53d91c82](https://github.com/hardbeat920/monocode/commit/53d91c82) Fix macOS Clippy chunking warnings
- [b1660e76](https://github.com/hardbeat920/monocode/commit/b1660e76) Fix ModelPicker type error from stale harness prop
- [e79778cd](https://github.com/hardbeat920/monocode/commit/e79778cd) Resize menu bar portrait and fix macOS 27 image visibility
- [03ae2775](https://github.com/hardbeat920/monocode/commit/03ae2775) Continue Mono replies after sessions complete
- [140c6e56](https://github.com/hardbeat920/monocode/commit/140c6e56) Add floating Mono chat panel with menu bar integration
- [bdc2b64c](https://github.com/hardbeat920/monocode/commit/bdc2b64c) Fix notes keeping an "untitled" slug after they get a real title (#788)
- [c2b479dd](https://github.com/hardbeat920/monocode/commit/c2b479dd) fix(codex): omit collaboration mode until a model is known (#771)
- [dddefe45](https://github.com/hardbeat920/monocode/commit/dddefe45) Stabilize host Vitest integration runs under load. (#683)
- [40aa9feb](https://github.com/hardbeat920/monocode/commit/40aa9feb) Add effort selection animations for other harnesses (#672)
- [d8902e73](https://github.com/hardbeat920/monocode/commit/d8902e73) Add per-Mono session sidebar visibility
- [e5794cc0](https://github.com/hardbeat920/monocode/commit/e5794cc0) Use chatting icon for session toggle
- [0b7a21fd](https://github.com/hardbeat920/monocode/commit/0b7a21fd) Add Mono launched sessions panel and persistence
- [0f8e5688](https://github.com/hardbeat920/monocode/commit/0f8e5688) Preserve delivered follow-up replies during inline work
- [432ac686](https://github.com/hardbeat920/monocode/commit/432ac686) Refine Mono activity display and completion handling
- [de83c796](https://github.com/hardbeat920/monocode/commit/de83c796) Add MonoCode session lifecycle controls
- [93ee54c8](https://github.com/hardbeat920/monocode/commit/93ee54c8) Add Mono permission controls to Details
- [de033ffa](https://github.com/hardbeat920/monocode/commit/de033ffa) fix(monos): keep IME candidate selection from sending in Mono inputs (#790)
- [9ccfc094](https://github.com/hardbeat920/monocode/commit/9ccfc094) Release v0.8.0
- [80ba2c09](https://github.com/hardbeat920/monocode/commit/80ba2c09) Throttle GitHub polling and handle rate-limit backoff
- [850be653](https://github.com/hardbeat920/monocode/commit/850be653) Add persistent Mono agents with memory and scheduled habits (#773)
- [5aef8623](https://github.com/hardbeat920/monocode/commit/5aef8623) Hide internal and legacy Copilot models from Pi/omp catalogs (#766)
- [b74e803e](https://github.com/hardbeat920/monocode/commit/b74e803e) Keep Pi extension status in one row per key (#760)
- [57366970](https://github.com/hardbeat920/monocode/commit/57366970) Render Nerd Font prompt glyphs in the terminal (#767)
- [07f29c13](https://github.com/hardbeat920/monocode/commit/07f29c13) fix(skills): raise the skill catalog cap from 300 to 5,000 (#750)
- [7eebfc17](https://github.com/hardbeat920/monocode/commit/7eebfc17) fix: preserve focused note title drafts (#769)
- [3e05e032](https://github.com/hardbeat920/monocode/commit/3e05e032) Preserve transcript scroll position during asynchronous updates
- [01036472](https://github.com/hardbeat920/monocode/commit/01036472) Improve modal layering and light-theme styling
- [0bfa5c61](https://github.com/hardbeat920/monocode/commit/0bfa5c61) Optimize streaming output, file indexes, and transcript rendering
- [185b5005](https://github.com/hardbeat920/monocode/commit/185b5005) Fix editor diff gutter layout and Inbox PR overview diff colors (#759)
- [a6b4b1d0](https://github.com/hardbeat920/monocode/commit/a6b4b1d0) Open general new terminals in the active session's worktree (#732)
- [680e1ab9](https://github.com/hardbeat920/monocode/commit/680e1ab9) Keep IME composition intact in remote session composers (#741)
- [98845e58](https://github.com/hardbeat920/monocode/commit/98845e58) Stop the remote folder dialog from darkening the window (#733)
- [98da85ae](https://github.com/hardbeat920/monocode/commit/98da85ae) Support async Codex agent questions
- [889ac206](https://github.com/hardbeat920/monocode/commit/889ac206) Paint macOS glass tint natively during resize
