# Upstream v0.7.1 uyarlama planı

Tarih: 2026-10-06
Durum: U01–U30 kaynak uyarlaması tamamlandı; yerel test sonuçları ve açık gerçek cihaz kabulü [uygulama kaydında](upstream-v0.7.1-integration-evidence.md). Kurulum yapılmadı.

## Amaç ve karşılaştırma tabanı

v0.7.1'deki bütün kullanıcı davranışlarını değerlendirmek; eksikleri mevcut MonoCode mimarisine uyarlamak, bizde eşdeğer veya daha güçlü olan çözümleri korumak. Başarı ölçütü upstream kodunun kopyalanması değil, davranış kapsamının tamamlanması ve mevcut özelliklerin korunmasıdır.

- Upstream: [v0.7.1](https://github.com/hardbeat920/monocode/releases/tag/v0.7.1), commit `807c70e0d56fad77a83e98dad12cef0e4f3ef460`.
- Plan karşılaştırma HEAD'i: `e78d881eef8d695434798d4480eb3dce4d452619`; uygulama başlangıcında yeniden doğrulanan temiz HEAD: `29b57cd82e8af4dc40bb7b7f5a4690b2dbf75546`.
- Yerel `package.json`: `0.9.1`, paket yöneticisi `pnpm@12.8.2`.
- Karşılaştırma mevcut staged, unstaged ve untracked çalışmaları da kapsar. HEAD tek başına güncel ürün tabanı değildir. Uygulama başlangıcında ilgili dosyalar yeniden okunmalıdır.
- Commit geçmişinde bir upstream commit'inin bulunmaması, davranışın eksik olduğunun kanıtı değildir. İlk incelemedeki farklı satırlar yalnızca aday bulmak içindir; nihai karar kaynak, mevcut testler ve davranış üzerinden verilir.

## Karar ve koruma kuralları

Her madde üç sonuçtan biriyle kapanır: **koru**, **uyarla**, **ekle**. Koru kararı için mevcut çözümün kabul senaryolarını karşıladığı gösterilir; uyarla kararı yalnızca eksik davranışı ekler. Kodun kısa, yeni veya upstream'de olması tek başına tercih nedeni değildir.

1. Tüm dalı merge etme veya dosyaları upstream sürümleriyle değiştirme. Commitleri referans olarak kullan; küçük, ilgili değişiklikleri mevcut sözleşmelere uygula.
2. Mevcut dirty çalışmaları koru. Başlangıç Git durumu ve değiştirilecek dosyaların staged/unstaged farklarını çalışma kaydına al; başka oturumun değişikliğini geri alma. Ortak dosyaya yazmadan önce tekrar oku.
3. Remote session kimliği `(environmentId, sessionId)`, host yazma otoritesi, revision kontrolleri, outbox sıralaması ve eski host fallback'i korunur. `docs/remote-session-protocol.md` bağlayıcı davranış tabanıdır.
4. Composer remount edilerek yenilenmez. Taslak, ekler, model/effort, per-message kuyruk ayarları ve remote refresh sırasında kullanıcı durumu korunur.
5. Sayfalı geçmiş, blok önizlemesi, ortak makine kanalı ve mevcut bellek/ağ/cache sınırları korunur. UI özelliği için tam geçmiş yükleme veya yeni sürekli polling eklenmez.
6. Worktree geçişinde açık sekmeler, çalışan agent, navigation boundary, pencere sahipliği ve task worktree'leri korunur. Yeni worktree seçimi mevcut navigation akışından yapılır.
7. Host task/review/goal, provider yetenekleri, dosya gezgini ve fork güncelleme kanalı bu çalışma nedeniyle sadeleştirilmez veya upstream seviyesine geri çekilmez.
8. Yeni abonelik, timer ve observer'lar kapanırken temizlenir. Animasyonlar reduced-motion'a uyar; gizli sekmede gereksiz çalışma üretmez. Rehberdeki ilke için yeni state/cache kütüphanesi zorunlu tutulmaz.
9. Uygulama sonunda her madde için karar, dosya, kanıt ve kalan native/remote kabul kaydı bulunur. Testi çalıştırılmamış davranış tamamlandı sayılmaz.

## Tam kapsam matrisi

Aşağıdaki tablo özgün kapsam ve kabul ölçütlerini korur. Uygulama sırasında doğrulanan son kararlar ve kanıtlar [uygulama kaydındadır](upstream-v0.7.1-integration-evidence.md). Aynı commit birden fazla davranış içerdiğinde yalnızca ihtiyaç duyulan bölümü alınmıştır.

| ID / aşama | Davranış ve upstream referansı | Önerilen karar / korunacak yerel davranış | Kabul ölçütü |
|---|---|---|---|
| U01 / 1 | Soru panelinde Geri (`6a5f7fa1`) | Ekle; mevcut çoklu seçim, serbest metin, süre ve interaction davranışı korunur. | Önceki soruya dönüş cevapları korur; değiştirilen cevap gönderilir; ilk soruda Geri yoktur. |
| U02 / 1 | Markdown/SVG review kaynak modu (`e65ed823`) | Uyarla; mevcut preview/source kabiliyeti korunur. | Diff kaynakta açılır; normal ve review sekmesi tercihleri birbirini değiştirmez. |
| U03 / 1 | Model arama odağı (`a5410169`) | Uyarla; ModelFlyout/Popover'ın mevcut odak ve Escape kuralları korunur. | Ana picker ve Models alt menüsünde görünür arama odağı alır; kapanış odağı doğru yere döner. |
| U04 / 1 | Uzun model adları (`31fcb090`) | Uyarla; provider, effort ve permission kontrolleri görünür kalır. | Dar ve geniş composer'da ad tek satırda okunur; kontrol taşması oluşmaz. |
| U05 / 1 | Explorer harf kırpılması (`14cb1ed5`) | Uyarla; yeni remote explorer yolu/etkileşimi korunur. | `g`, `p`, `y` kırpılmaz; seçme, rename, drag ve klavye hareketi çalışır. |
| U06 / 2 | Dosya/image drop yaşam döngüsü (`56bae446`) | Uyarla; mevcut paste generation/read takibi drop'a genişletilir, yeni paralel ek sistemi kurulmaz. | Provider/ready değişimi, reset/unmount sırasında geç okuma, aynı dosyanın çift native/browser olayı, boş file-list image item ve okuma hatası kapsanır; Send tüm ilgili okumaları bekler. |
| U07 / 2 | Klasör stage/unstage (`fb55b255`, test düzeltmesi `4361fdb6`) | Ekle; mevcut mutation kuyruğu, conflict ve diff invalidation davranışı kullanılır. | Yalnızca klasör altı etkilenir; silinmiş dosyalar dahil; local/remote, staged/unstaged ve busy durumu doğru; ilgili açık diffler güncellenir. |
| U08 / 2 | Literal Git yolları (`60102ab3`) | Koru ve klasör kabulüne genişlet; yerel Rust ve host ortak Git yardımcısında koruma mevcut. | `*`, `?`, `[ab]`, `:(glob)*` adları kardeş yolları etkilemez; unborn HEAD ve path escape kontrolleri korunur. Windows'ta geçersiz dosya adları uygun platformda veya komut-arg testiyle sınanır. |
| U09 / 2 | Worktree arama/oluşturma (`22b48740`) | Ekle; mevcut createWorktree ve worktree navigation sözleşmesi kullanılır. | Branch/yol arama, oklar/Enter, eşleşmeyen adla seçili checkout HEAD'inden oluşturma, hata/progress ve tekrar gönderme koruması; task worktree ve açık sekmeler kaybolmaz. |
| U10 / 3 | Canlı başlık/bağlı iş geçmişi (`929c45b3`) | Uyarla; remote özet otoritesi ve partial-history kayıt engeli korunur. | Save beklemeden doğru başlık/bağlı iş gösterilir; stale remote özet daha yeni bilgiyi ezmez. |
| U11 / 3 | Submit/steer öncesi bekleyen olaylar (`929c45b3`) | Mevcut flushHarnessEvents çağrılarını koru; yalnızca eksik gönderim yoluna ekle. | Alınmış agent çıktısı yeni user mesajından önce gelir; son state okunur; queue model/effort ve stop/error geçişleri korunur. |
| U12 / 3 | Transcript scroll kararlılığı (`7933972a`) | Yerel çözüm ana taban; upstream'den yalnızca eksik resize/anchor davranışı uyarlanır. | Önceki turların birlikte büyümesi ve composer resize okuma konumunu korur; layout/queued scroll paused follow'u açmaz; code-block scroll yanlışlıkla follow'u kesmez; prepend ve remote paging çalışır. |
| U13 / 3 | İlk chunk ve düzenli output reveal (`7933972a`) | Uyarla veya kabulü karşılayan yerel pacing'i koru. | İlk paint öncesi biten yanıt da doğru gösterilir; yeni chunk saati sıfırlamaz; kayıtlı/gizli sekme çıktısı açılınca hemen görünür; RAF sızıntısı yoktur. |
| U14 / 4 | Inbox timeline ve özetler (`00d68d34`) | Uyarla; fork PR eylemleri, linked-work-item takibi ve diff görüntüleme korunur. | Comment/review/commitler deterministik tarih sırasıyla; ardışık aynı yazar commitleri gruplanır; uzun yorum/açıklama açılır; dosya sayıları ve diff bağlantıları doğru. |
| U15 / 4 | Inbox hover preload ve cache (`00d68d34`) | Mevcut cache/inflight paylaşımına eksik detail, freshness ve hover/focus ön yükleme eklenir. | Aynı istek paylaşılır; taze sonuç kullanılır; stale/force yenilenir; mutation invalidate eder; farklı repo/account karışmaz; hata yeniden denenebilir; cache sınırlı kalır. |
| U16 / 5 | Diff paletleri ve +/- marker (`e188ff1e`) | Ekle; mevcut tema/settings şeması ve diff motoru korunur. | Default/Colorblind/High contrast light/dark'ta diff, gutter, preview, sayaç ve dosya statülerine uygulanır; +/- marker okunur; eski ayar güvenli varsayılanla açılır. |
| U17 / 5 | Sidebar header aksiyonları (`610550e4`) | Geniş görünümü koru; eksik kompakt düzeni uyarla. | Search/new geniş ve kompakt görünümde erişilebilir; drag region, pencere kontrolleri ve remote proje davranışı korunur. |
| U18 / 5 | Quick Composer izin/proje picker (`dcaba3dc`) | Uyarla; per-provider permission ve model/effort kabiliyetleri korunur. | Ayrı izin seçimi doğru gönderim payload'ına yansır; picker focus/Escape ve dar ekran yerleşimi çalışır; desteklenmeyen provider'a geçersiz ayar verilmez. |
| U19 / 5 | Kalan kullanım chip/tooltip/cards (`3ab724d8`) | Mevcut useShowRemainingUsage ve clamp mantığını koru; eksik yüzeyleri aynı ayara bağla. | Ayar değişimi bütün yüzeyleri hemen günceller; negatif/>100 değerler clamp edilir; provider/account bilgisi doğru kalır. |
| U20 / 5 | Sidebar diff stats boyutlanması (`dc6d0ef4`) | Uyarla; yerel remote/rail sayaçları korunur. | Sidebar resize ve büyük sayılarda sığar; ölçüm render döngüsü üretmez; observer temizlenir. |
| U21 / 6 | Taşan tab başlığı fade (`990f1411`) | Uyarla; mevcut tab drag/drop/popout ve preview/pin davranışı korunur. | Yalnızca gerçek overflow'da fade; resize/rename sonrası güncellenir; close/dirty kontrollerini kapatmaz. |
| U22 / 6 | Sidebar/transcript alt fade ve scroll boşluğu (`990f1411`) | U12 tamamlandıktan sonra uyarla. | Son session ve reply tamamen görülebilir; follow, docked composer resize ve remote paging bozulmaz. |
| U23 / 6 | Yeni session giriş animasyonu (`f4868d4e`) | Uyarla; pagination ve remote list difflerini yeni session sanma. | Yalnızca gerçekten yeni session animasyon alır; proje açma, reorder, cache hydrate ve drawer açma tekrarlamaz. |
| U24 / 6 | Başlık sweep/particle (`929c45b3`) | U10'dan sonra ekle; live title doğruluğu animasyondan bağımsızdır. | Başlık okunur; reduced-motion/gizli tab'da uygun biçimde durur; task başlıkları ve rename korunur. |
| U25 / 6 | Pane ve linked panel girişleri (`45c9a222`, `ce656baf`) | Uyarla; mevcut split/popout/linked-panel akışı korunur. | Yeni pane doğru kenardan girer; mount/restore animasyonu tekrarlamaz; transform animasyonu transcript'i her frame yeniden akıtmaz; reduced-motion desteklenir. |
| U26 / 1 | Pi extension modelleri (`c7de48fd`) | Uyarla; diğer Pi flavor'larının noExtensions kuralı korunur. | Pi extension modeli bulunur; diğer flavor katalogları değişmez; discovery hatası mevcut fallback'i bozmaz. |
| U27 / 1 | npm Pi launcher tanıma (`e9fd233b`) | Uyarla; host shell/platform/provider güvenli keşfi korunur. | Launcher resolve ve enclosing package manifest doğru Pi'yi tanır; ilgisiz `pi` binary'si kabul edilmez; Windows shim/symlink senaryoları değerlendirilir. |
| U28 / 1 | Eski GitLab diffs fallback (`e994afb8`) | Ekle; mevcut pagination/error sözleşmesi korunur. | /diffs 404 ise /changes; 401/403/connection hataları gizlenmez; overflow/incomplete yanıt truncated olur. |
| U29 / 7 | Contributors README (`6bd432ca`) | Fork README/CREDITS/NOTICE korunarak atıf ekle veya mevcut eşdeğer atfı koru. | Upstream katkıcı bağlantısı ve badge açık; fork kurulum, sürüm ve download bağlantıları değişmez. |
| U30 / tümü | Upstream regression coverage | Testleri mevcut yerel kontratlara uyarla; kaynak satırlarını kopyalayan test ekleme. | İlgili davranışlar ve yerel regresyonlar sınanır; folder refresh timer yarışları deterministik kontrol edilir. |

## Uygulama sırası ve bağımlılıklar

### 0. Başlangıç ve eşdeğerlik kaydı

Güncel Git durumu, etkilenen yerel değişiklikler ve test tabanı kaydedilir. Her ID için koru/uyarla/ekle kararı kaynakla güncellenir. Mevcut sorunlar yeni değişikliklerin hatasıyla karıştırılmaz. Uygulama yetkisi geldiğinde başlanır; bu plan kod uygulama veya kurulum talebi değildir.

### 1. Sınırlı kapsamlı düzeltmeler

U01–U05 ve U26–U28. Soru, dosya review, model, explorer, Pi ve GitLab değişiklikleri küçük birimler halinde yapılır. Ortak dosya U05'te mevcut remote explorer değişiklikleri yeniden okunur.

### 2. Ekler ve Git/worktree eylemleri

U06–U09. Drop için yeni okuma yolu yerine mevcut paste/generation altyapısı genişletilir. Klasör mutation'ları mevcut seri işlem kuyruğuna bağlanır. Worktree oluşturma başarılı olmadan navigation state değiştirilmez; hatada açık workspace korunur.

### 3. Canlı state, scroll ve pacing

U10–U13. Önce state sıralaması, sonra resize/scroll, sonra pacing. Yerel `AgentTranscript`, `RemoteSession`, `SessionPane`, `NavigationBoundary` ve sayfalama davranışı birlikte değerlendirilir. Scroll/pacing'i uygulayan birim, görsel fade eklenmeden kabul edilir.

### 4. Inbox

U15 cache/istek paylaşımı önce, U14 timeline ikinci. Detay/thread/diff anahtarları ve invalidation mevcut hesabın/reponun kapsamını korur. PR eylemleri veya work-item refresh'i eski cache ile yanlış bilgi göstermemelidir.

### 5. Ayarlar ve UI düzeni

U16–U20. Diff tokenları ortak yüzeylere tek sözleşmeyle uygulanır. Quick Composer ve sidebar düzeni state veya provider payload davranışını değiştirmeden tamamlanır.

### 6. Animasyonlar ve fade

U21–U25. U10/U12/U13/U17 tamamlanmadan ilgili animasyon/fade eklenmez. Hareket, durum güncellemesinin veya kaydırmanın ön şartı yapılmaz. Tek yazar yaklaşımıyla ortak `App.tsx`, `Sidebar.tsx`, `AgentTranscript.tsx`, `PaneTree.tsx` ve CSS değişiklikleri sıralanır.

### 7. Kapsam kapatma ve doğrulama

U29/U30 ve bütün ID'lerin kanıt kaydı. Kaynak referansı, son karar, değişen dosyalar, kontrol sonuçları ve açık native kabul maddeleri raporlanır. Daha önce alınmış 0.7.0 iyileştirmeleri için yalnızca etkilenen regresyonlar kontrol edilir; kapsam sessizce yeni özelliklerle genişletilmez.

## Doğrulama planı

Her anlamlı birimin odaklı kontrolü bir kez çalıştırılır; sadece ilgili edit, hata veya açık belirsizlik varsa tekrarlanır. Ortak dosyaların uygulaması bittikten sonra son tip/build ve çapraz özellik kontrolü yapılır. Plan aşamasında testler çalıştırılmadı.

| Alan | Mevcut dayanak / genişletilecek senaryolar |
|---|---|
| Soru/model/dosya | `QuestionForm.test.ts`, `ModelPicker.test.ts`, `FileTree.test.ts`; review-mode ayrımı için davranış testi. |
| Drop | `ComposerFileDrop.test.ts`; provider/ready lifecycle, late read, double event, send-waits ve browser image item senaryoları. |
| Git/worktree | `GitChangesPanel.test.ts`, `GitChangesPanelConflicts.test.ts`, `SidebarWorktreeSwitcher.test.ts`, `workspaceSnapshot.test.ts`, host `workspace.test.ts`/`workspaceGitRuntime.test.ts`; native fs testleri. |
| Canlı state | `sessionHistory.test.ts`, `queuePersistence.test.ts`, `NavigationBoundary.test.ts`, ilgili local/remote send/steer testleri. |
| Scroll/pacing | `AgentTranscriptScroll.test.ts`, `AgentTranscriptPacing.test.ts`, `wordFade.test.ts`, `wordFade.pacing.test.ts`, `composerResize.test.ts`, `composerResizeFrame.test.ts`. |
| Remote korumaları | `sessionAccess.test.ts`, `remoteResourceBounds.test.ts`, ilgili remote navigation/transport recovery testleri ve host `remote-performance.integration.test.ts`. |
| Inbox/appearance | Yerel mevcut Inbox testleri ve uyarlanmış upstream timeline/freshness testleri; `UsageProviderChip.test.ts`, settings/appearance ve diff-marker senaryoları. |
| Provider/native | Pi katalog testleri, host `process.test.ts`, Rust GitLab parser/fallback ve fs testleri. |

Frontend odaklı kontroller `pnpm exec vitest run <ilgili dosyalar>`, host kontrolleri `pnpm exec vitest run --config host/vitest.config.ts <ilgili dosyalar>` ile seçilir. Son kontrol mevcut `check:web`/`check:rust` sözleşmeleri ve host TypeScript kontrolüdür; host testleri ayrıca kendi config'iyle değerlendirilir. pnpm sürümü packageManager alanıyla eşleşir. Gereksiz dependency veya sürüm yükseltmesi yapılmaz.

Native/UI kabul ayrıca kaydedilir: Windows ölçekli ekran ve Retina Mac drop; dar/geniş/kompakt layout; light/dark ve reduced-motion; split/popout; uzun transcript ve code-block içi scroll; yerel ve uzak folder staging; kopma/toparlanma sırasında taslak/ek/kuyruk; tek agent otoritesi. Gerçek makine veya servis yoksa ilgili kabul açık bırakılır, unit test başarısı yerine geçmez.

Performans karşılaştırması aynı senaryo/veriyle yapılır: listener/observer/RAF temizliği, Inbox tekrar istek sayısı, remote boşta trafik ve cache sınırları, uzun transcript/frame davranışı. Sayısal kazanç ölçüm yapılmadan iddia edilmez. Yeni ölçüm önceki baseline'a göre materyal kötüleşme gösterirse ilgili değişiklik yeniden tasarlanır veya kabulü karşılayan yerel çözüm korunur.

## Tamamlanma ve teslim sınırı

- Tüm U01–U30 maddeleri koru/uyarla/ekle kararı ve davranış kanıtıyla sonuçlandırılmıştır; tek bir işlev eksikse açık madde olarak raporlanır.
- Mevcut fork özellikleri ve dirty çalışma korunmuştur; eski host uyumu ve remote session sözleşmesi bozulmamıştır.
- Odaklı kontroller ve son ortak kontrollerin sonuçları, başlangıçtan kalan hatalardan ayrılmıştır.
- Yerel kaynak doğrulaması, paketleme, kurulum ve gerçek iki makine kabulü ayrı durumlar olarak raporlanır.
- Commit/push/public release bu planın kapsamında değildir. Kurulum istenirse `docs/local-update.md` ve `scripts/update-local.ps1` koordinatörü kullanılır; bu plan nedeniyle build/install başlatılmaz.
