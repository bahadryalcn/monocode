# MonoCode performans, hata ve ağ yükü TODO — 3 Ekim 2026

Bu listede **26 madde** var. İlk uygulama grubunda **7 madde kod ve hedefli test düzeyinde tamamlandı, 2 maddede kısmi ilerleme var, Laya maddesi kullanıcı isteğiyle kapsam dışı**. Toplam **18 madde açık**; bunların ikisi kısmen uygulandı. Canlı CPU/ağ kabul ölçümü P24 altında devam ediyor; işaretlenen kutular gerçek uzak sunucuda ölçüm yapıldığı anlamına gelmez. 0.8.42 kurulumunda gözlenen Mac pencere açma çökmesi P26 olarak eklendi.

## Uygulama durumu — ilk grup

| Madde | Durum | Uygulanan değişiklik |
| --- | --- | --- |
| P01 | Kapsam dışı | Kullanıcı Laya'yı ayrıca kaldıracak. MCP yapılandırmasına veya süreçlerine müdahale edilmedi. |
| P02 | Kod tamamlandı | Pencere kimliği, oturum sahipliği, sahibine komut teslimi ve sahibine ait ACK. Handler hatası ACK edilmiyor; başka pencerenin heartbeat'i oturumu silmiyor. |
| P03 | Kod tamamlandı | Paylaşılan HTTP agent, 32 toplam / host başına 4 boş bağlantı sınırı; metadata kontrollü makine cache'i ve her yazmada invalidation. Yerel TCP testi aynı bağlantıda farklı kimlik bilgileriyle iki RPC doğruluyor. |
| P04 | Kod tamamlandı | Foreground aktif 750 ms; görünmeyen aktif sekme 3 s; gizli doküman aktif 5 s / boşta 30 s. Görünürlük geri geldiğinde hemen yenileme, in-flight koruması. Kullanıcı komutları bu gecikmeye tabi değil. Native minimize durumunun `document.hidden` ile eşleşmesi canlı ortamda ölçülmeli. |
| P05 | Kısmi | Sidebar/rail aynı machine/project in-flight sorgusunu ve TTL cache'ini paylaşıyor. Aynı veri aynı array'i döndürüyor; değişmeyen localStorage/event yazısı kaldırıldı; invalidation öncesindeki cevap yeni sonucu ezemiyor. **Host branch cache, SQL filtre/index ve conditional liste cevabı açık.** |
| P11 | Kod tamamlandı | Aktif kök/proje bazlı klasör yenileme, en fazla 4 eşzamanlı listeleme ve in-flight paylaşımı. Değişmeyen periyodik liste index'i tetiklemiyor; içerik yazıları Git/explorer bildirimini koruyor. |
| P13 | Kod tamamlandı | En fazla 2 indirme; otomatik önizlemelerde 40 MiB ham byte / 32 görsel bütçesi; 30 s–5 dakika hata backoff'u. Eski/bütçe dışı görseller tıklanınca yükleniyor, lightbox kapanınca geçici veri bırakılıyor. |
| P20 | Kod tamamlandı | Opt-in 1 MiB pull sayfaları, sabit high-water sınırı ve atomik peer checkpoint. Kesilen ilk pull tamamlanmış sayılmıyor; sonraki sayfadaki grup/projeleri referanslayan düzen kayıtları tekrar uygulanıyor. Eski tek-cevap protokolü korunuyor. |
| P21 | Kod tamamlandı | Host değeri UTF-8 byte ile sınırlıyor; gönderimler 1 MiB/100 op batch'lerine bölünüyor. Geçersiz/aşırı büyük op yerelde kalıyor ve görünür sync hatası oluşuyor; geçerli komşuları işleniyor. |
| P23 | Kısmi | Aynı blok sayısındaki farklı metin reddediliyor; ortak baseline varsa host reset/rewind destekleniyor. In-flight yerel edit korunuyor; reddedilen sürüm aynalanmış sayılmıyor ve açık oturumda conflict uyarısı gösteriliyor. **Kapalı oturumun native DB okuma/kaydetme aralığı için atomik CAS ve pencereler arası yarış doğrulaması açık.** |

İlk incelemenin aşağıdaki ölçümleri ve probe JSON'u tarihsel kanıttır. `probes.mjs` eski hata davranışını bekler; düzeltme sonrası regresyon suite'i yerine kullanılmamalı. Yeni doğrulama sonucu bu dosyanın sonundadır. İlk kod grubunda kurulu EXE/host değiştirilmedi; kullanıcı talimatıyla yapılan sonraki [0.8.42 güncellemesinde](deployment-0.8.42-2026-10-03.md) Windows ve Mac uygulamaları ile iki host kuruldu ve RPC doğrulandı. Runtime trafik kazanımı henüz ölçülmedi.

## Kapsam ve kanıt sınırı

- İlk incelemede frontend, Tauri uzak RPC/SSH, yerel host, oturum senkronizasyonu, dosya ağacı/index, Git, Inbox, Tasks/Goals/Automations, terminal ve görsel döngüler incelendi. O aşamada yalnızca rapor ve kanıt dosyaları oluşturuldu. Sonraki uygulama değişiklikleri yukarıdaki tabloda belirtiliyor. Commit/push yapılmadı.
- Başlangıçta staged/unstaged çalışmalar vardı; inceleme sırasında başka çalışmalar da dosyaları değiştirdi. Satırlar incelenen çalışma ağacına aittir; düzeltmeye başlamadan güncel kaynak tekrar kontrol edilmeli. Çalışan kurulu EXE ölçüm anında **0.8.33**, son yazılma zamanı **17:59:02 +03:00** idi. Çalışma ağacı ile kurulu ikilinin birebir eşleştiği doğrulanmadı.
- Önceki [Git/diff TODO](review-todo-2026-10-03.md) ve [genel inceleme TODO](unchanged-code-todo-2026-10-03.md) dosyalarının düzeltilmiş maddeleri yeni açık hata olarak tekrar sayılmadı.
- **Canlı:** pasif Windows süreç ölçümü. **Tekrarlandı:** gerçek kaynak fonksiyonlarıyla sentetik, izole deney. **Kaynak:** mevcut kontrol akışında görülen yapı. **Risk:** uçtan uca oluşması koşula bağlı. **Ölçüm:** etkisi veya kök nedeni henüz belirlenmemiş iş.
- P1: önce ele alınacak kaynak yükü, komut kaybı veya veri tutarlılığı. P2: performans/güvenilirlik. P3: gözlem ve test altyapısı.
- Gerçek uzak sunucuda işlem, paket yakalama, servis/ayar değişikliği, kontrollü minimize/boşta kullanım veya üretim veritabanında deney yapılmadı. Dolayısıyla gerçek istek/s ve KB/s, uzak sunucunun CPU maliyeti ve tüm ürün hatalarının tüketildiği iddia edilmez. Ağ hızları aşağıda **koddan hesaplanan nominal aralıklar**, ölçülmüş trafik değildir.

## Canlı ölçüm

[Süreç örnekleri](performance-validation-2026-10-03/process-samples.json) 18:37:27–18:37:44 +03:00 arasında alındı. Kullanıcının etkileşimi kontrol edilmedi. Süreçlerin çalışma kümeleri ortak bellek sayfaları içerebilir; toplamlar benzersiz fiziksel RAM değildir. MonoCode altındaki ajan ve araç süreçleri de ayrıştırıldı.

| Gözlem | Sonuç | Anlamı |
| --- | --- | --- |
| Renderer, PID 11084 | 16,68 saniyede 18,297 CPU saniyesi; tek çekirdeğe göre %109,7 | Birden fazla thread ile yaklaşık 1,10 çekirdek kullanımı; tüm bilgisayarın %109,7'si değildir. |
| WebView GPU süreci, PID 54568 | 13,422 CPU saniyesi; tek çekirdeğe göre %80,5 | GPU sürecinin **CPU** kullanımı; GPU kullanım yüzdesi ölçülmedi. |
| MonoCode ana süreç, PID 64260 | 0,297 CPU saniyesi; tek çekirdeğe göre %1,8 | Bu kesitte ana native süreç, WebView kadar CPU kullanmadı. |
| 7 WebView süreci | Yaklaşık 1.216–1.277 MB çalışma kümesi | Uzun süreli büyüme/heap sızıntısı kanıtı değildir. |
| 2 ağır Laya/Python süreci ve 2 küçük Python başlatıcısı | Yaklaşık 3.309 MB çalışma kümesi, 4.906 MB private bellek | Oturum başına ayrı model süreçlerinin belirgin maliyeti var. |

İlk 18:32 örneğinde dört ağır Python süreci yaklaşık 1.642–1.652 MB çalışma kümesine sahipti. 18:33'te üç süreç için `python -> python -> laya-mcp-server -> codex -> node -> cmd -> monocode` ebeveyn zinciri ayrıca doğrulandı. Sonraki örneklerde sayı ikiye indi. Bu gözlem **sızıntı kanıtı değildir**; ancak aynı anda birkaç model kopyasının RAM maliyetini doğrular. Ajanların çalışma/bekleme durumu kullanıcı arayüzünden kontrol edilmedi.

18:48 civarındaki ayrı TCP anlık görüntüsünde MonoCode ana PID'sinin established bağlantısı yoktu; izlenen alt süreçlerde bir dış bağlantı vardı. Bu görüntü, HTTP sorguları arasındaki kısa bağlantıları kaçırabilir ve sürekli uzak host trafiğini ne ölçer ne dışlar. Ağ yükünün varlığı/maliyeti aşağıdaki kaynak bulguları ve P24 ölçümüyle değerlendirilmelidir.

## İletişim envanteri

| Döngü | Nominal aralık | Kapsam ve tetikleyici | Kaynak |
| --- | --- | --- | --- |
| Uzak konuşma sync | Çalışırken 750 ms; görünür boşta 3 s; gizli sekmede boşta 10 s | Açık uzak oturum; çalışırken `visible` yavaşlatması uygulanmıyor | `RemoteSession.tsx:378–463` |
| Açık uzak proje oturum listesi | 3 s; hatada 6–30 s | Proje sidebar'ı | `connections.ts:483–547` |
| Rail uzak oturum listeleri | Çalışan varsa 4 s, yoksa 10 s | Rail üzerindeki uzak projeler; kısa cache yalnızca tamamlanmış sonuçları paylaşır | `connections.ts:554–643` |
| Makine durumu | 15 s; hatada 6–30 s | Durum hook'unun abonesi olan her makine | `connections.ts:388–442` |
| Uzak dosya ağacı | 5 s | Görünür dokümanda uzak FileTree; global klasör cache'ini tazeler | `FileTree.tsx:848–854` |
| Git index | 2 s | Changes paneli; gizli dokümanda durur | `GitChangesPanel.tsx:1940–1947` |
| Inbox | 30 s, force refresh | Projeler varsa; tray/minimize halinde de devam eder | `useInboxUnseen.ts:212–398` |
| Tasks/Goals | 15 s | Tasks view mount edilmişken; görünürlük/in-flight kapısı yok | `TasksView.tsx:284–315` |
| Automations | 30 s | Automations view mount edilmişken; görünürlük/in-flight kapısı yok | `AutomationsView.tsx:272–287` |
| Arka plan bildirimleri | 60 s | Bildirimler açık ve lider pencereyse; Tasks açıkken Tasks/Goals taranmaz | `useBackgroundNotifications.ts:21–95` |
| Proje/grup/appearance sync | 30 s; yerel değişimle en az 3 s ara | Sync destekleyen kayıtlı makineler; pencere görünürlüğüne bağlı değil | `syncClient.ts:184–277` |
| Desktop heartbeat | 1,5 s | **Yerel loopback host**, host erişilebilirse; gizliyken de devam eder | `desktopLive.ts:5`, `useDesktopLive.ts:36–70`, `localSync.ts:8–18` |
| Adopted session mirror | Görünür 5 s, gizli 20 s | **Yerel loopback host** | `adoptedSessions.ts:34–35`, `useAdoptedSessions.ts:43–139` |
| Yerel canlı oturum kaydı | 1,5 s | Host erişilebilir ve yerel oturum çalışıyorsa; disk/IPC, doğrudan dış ağ değil | `App.tsx` içindeki `LIVE_PERSIST_MS` ve canlı kayıt effect'i |
| SSH keepalive | Trafiksiz bağlantıda 5 s, üç cevapsız deneme | Küçük bağlantı sağlık paketleri; transcript indirme değildir | `remote_ssh.rs:519–523` |
| Git auto-fetch | 5 dakika | Varsayılan kapalı; Changes paneli açık/görünür ve özellik etkinse | `autoFetch.ts:4–10`, `GitChangesPanel.tsx:231–245` |
| Uygulama güncelleme kontrolü | 30 dakika | Tek yükleme devam ederken tekrar başlamaz | `SidebarUpdate.tsx:45–83` |

Örneğin bir aktif uzak oturum 750 ms döngüyle teorik olarak dakikada yaklaşık 80 sync sorgusu üretir; 3 saniyelik proje listesi yaklaşık 20 sorgu daha ekler. Gerçekte cevap süresi, hata/backoff, cache ve mount durumu bu sayıları değiştirir. SSH keepalive ve güncelleme sorgusunu transcript/Git/file taramalarıyla aynı maliyette değerlendirmemek gerekir.

## Açık TODO'lar

### P1 — Kaynak yükü ve doğruluk

- **P01 — Oturum başına ağır Laya/model süreçlerinin çoğalmasını azalt. [Kapsam dışı — kullanıcı isteği]**
  - Kanıt: yukarıdaki süreç ölçümü ve ebeveyn zincirleri; `src/integrations/harness/core/registry.ts:116–185`, `:219–240` boşta child'ları 5 dakika sıcak tutuyor. Laya'nın kendi başlatılması provider/MCP yapılandırmasının sorumluluğunda; doğrudan MonoCode'un model yüklemesi değildir.
  - Etki: model çağrısı yapılmasa bile birkaç ayrı Python/model kopyası GB düzeyinde bellek ayırabiliyor. Maliyet ajan oturumu sayısıyla artıyor.
  - TODO: provider/MCP başlatma politikasını ve gerçek sunucu ayarını incele; desteklenen paylaşımlı hizmet/lazy yükleme ve yapılandırılabilir idle park uygula. Çalışan veya kullanıcı girdisi bekleyen turn'ü durdurma; Python süreçlerini körlemesine öldürme.
  - Kabul: 1/3/5 oturumun aktif ve boşta durumunda parent tree ve RAM ölçülsün; boşta bırakılan/kapatılan oturumlar belirlenen süre içinde kaynaklarını bıraksın. MCP komutları, resume ve onay bekleyen işler çalışmaya devam etsin.

- [x] **P02 — Çoklu pencerede desktop heartbeat ve komut sahipliğini düzelt. [Kod + hedefli test]**
  - Kanıt: `host/desktopLive.ts:49–98`, `:110–113`; `src/features/connections/model/useDesktopLive.ts:20–75`, `desktopLive.ts:118–135`. [Deney P02](performance-validation-2026-10-03/probes.json): B penceresinin heartbeat'i A oturumunu running=false yaptı. B, A'nın Stop komutunu uygulamadan ACK etti; A'ya kalan komut sayısı 0 oldu.
  - Etki: uzak kullanıcının Stop/Approve/Answer komutları kaybolabilir; aktif oturum yanlışlıkla boşta görünebilir. Her pencere ayrıca ayrı heartbeat üretir.
  - TODO: pencere/client kimliği ve oturum sahipliğiyle birleştirilmiş heartbeat/komut yönlendirme ekle; yalnızca sahibi komutu tamamlasın. Lider pencere seçilecekse diğer pencerelerin oturumlarını da toplamalı.
  - Kabul: farklı oturum çalıştıran iki pencerenin heartbeat sırası state'i silmesin; Stop/Approve/Answer tam bir kez doğru pencereye gitsin. Pencere kapanması yalnızca onun oturumlarını etkilesin.

- [ ] **P23 — Adopted session birleştirmesinde yalnızca blok sayısına güvenme. [Risk; yardımcı fonksiyonda tekrarlandı]**
  - Kanıt: `src/features/connections/model/adoptedSessions.ts:42–70`, `:96–107`. Aynı blok ID'si/sayısı ama yeni yerel metin bulunan sentetik örnekte eski host metni yerelin üzerine geçti; [P23 deney sonucu](performance-validation-2026-10-03/probes.json).
  - Etki: blok sayısı değişmeden yapılan yerel edit/rewind veya gecikmiş host kopyası için tutarlılık koruması yetersiz. Gerçek kullanıcı verisi kaybı bu incelemede yaşatılmadı.
  - TODO: son birleştirilen sürüm ve iki taraftaki değişiklikleri karşılaştır; ownership/CAS veya üç yönlü birleştirme uygula. Reddedilen birleştirmeyi başarıyla aynalanmış gibi işaretleme; görünür conflict/recovery durumu sun.
  - Kabul: aynı sayıda blok içeren yeni yerel edit eski host tarafından ezilmesin; çatışmasız host güncellemesi, reset ve rewind desteklensin.

### P2 — Ağ, host ve UI performansı

- [x] **P03 — Uzak RPC'lerde HTTP istemcisini ve bağlantı havuzunu yeniden kullan. [Kod + hedefli test]**
  - Kanıt: `src-tauri/src/remote.rs:143–160` her `rpc()` çağrısında yeni `ureq::Agent` kuruyor. `remote_request:407–415` ayrıca kayıt dosyasını her çağrıda okuyup parse ediyor.
  - Etki: istekler arası bağlantı havuzu paylaşılmaz; sık sorgularda yeniden TCP/TLS kurulumu ve yerel dosya/JSON işi oluşabilir. Gerçek handshake sayısı henüz ölçülmedi.
  - TODO: uygulama state'inde paylaşılan/sınırlı HTTP agent ve güncellenebilir makine cache'i kullan; kimlik doğrulama, endpoint değişimi, revoke ve SSH lease kurallarını koru.
  - Kabul: aynı hosta 100 ardışık küçük RPC için bağlantı sayısı ve handshake süresi düşsün; makine düzenleme/disconnect sonrası eski endpoint veya credential kullanılmasın.

- [x] **P04 — Gizli çalışan uzak sekmelerin 750 ms polling'ini yönet. [Kod + hedefli test]**
  - Kanıt: `src/features/connections/ui/RemoteSession.tsx:438–447` `active` dalını `visible` öncesinde seçiyor; `document.hidden` kontrolü yok.
  - Etki: açık her çalışan uzak oturum, sekme görünmese de hızlı sorgulanır; minimize hali de uygulama tarafından yavaşlatılmaz. İstek sayısı sekmeler/pencerelerle artabilir.
  - TODO: foreground, gizli çalışan ve boşta modları için ortak scheduler; host change/long-poll veya bildirim mekanizması değerlendir. Kritik Stop/Approve/Answer teslim gecikmesini koru.
  - Kabul: 1/5/10 uzak sekmede görünür/gizli/minimize istek ve byte ölçülsün; gizli modda transcript yükü azalsın, turn sonucu ve giriş bekleme durumu kaybolmasın.

- [ ] **P05 — Oturum listelerinin çift sorgusunu, tekrar yazısını ve hosttaki tekrarlı Git/tarama işini azalt. [Tekrarlandı + Kaynak]**
  - Kanıt: `connections.ts:504–539` her 3 saniyede yeni listeyi state/localStorage'a yazıp event yayınlıyor. `:594–605` yalnızca tamamlanmış sonucu cache'liyor. Sentetik hook/IPC deneyinde aynı proje için eşzamanlı **iki** `sessions.list` oluştu.
  - Host kanıtı: `host/server.ts:481–519` her liste sorgusunda her farklı çalışma klasörü için yeniden `git symbolic-ref` çalıştırıyor. `host/desktopSessions.ts:178–191` projeyi SQL'de filtrelemek yerine `collect("1=1", [], false)` ile tüm masaüstü oturum özetlerini okuyup sonradan filtreliyor. Transcript'ler bu liste yolunda okunmuyor; maliyet özet taraması/Git süreçleridir.
  - Etki: aynı verinin çift yüklenmesi; değişmeyen listelerde parse, render ve senkron localStorage yazısı. Her polling turunda çalışma klasörü sayısı kadar host Git süreci ve proje dışı oturum taraması.
  - TODO: machine/project anahtarlı in-flight Promise ve revision/TTL cache'i; manuel refresh invalidation ve içerik değişmediyse yayın/yazıdan kaçınma. Hostta branch/ref cache'i ve normalize edilmiş proje anahtarıyla SQL filtreleme; liste revision/conditional response ekle.
  - Kabul: aynı projeyi gösteren sidebar ve rail ilk açılışta da tek sorgu kullansın; değişmeyen cevap React state/localStorage/event güncellemesin. Sabit ref'lerde 100 liste sorgusu 100 Git süreci gerektirmesin; branch switch görünümü zamanında güncellensin; proje dışı satırlar taranmasın.

- [ ] **P06 — Rail polling'inde başarısız makineyi sağlıklı makinelerden bağımsız yavaşlat. [Kaynak]**
  - Kanıt: `connections.ts:594–635` tüm hedefleri sınırsız `Promise.all` ile bekliyor; tek `failures` sayacı `results.some(Boolean)` ile sıfırlanıyor.
  - Etki: bir makine cevap verdiğinde erişilemeyen diğerleri backoff'a geçmeyebilir. Bir yavaş hedef, bütün rail sonuçlarının yayınını geciktirir.
  - TODO: makine/hedef başına backoff+jitter ve sınırlı concurrency; tamamlanan sonuçları bağımsız yayınlama; reconnect sonrası kontrollü tazeleme.
  - Kabul: bir sağlıklı ve bir timeout olan hostla sağlıklı liste gecikmesin; offline host hızlı döngüde sürekli denenmesin. Büyük railde eşzamanlı iş sayısı belirlenmiş sınırı aşmasın.

- [ ] **P07 — Capability, proje listesi ve board ön sorgularını ortaklaştır. [Kaynak]**
  - Kanıt: `hostAutomationClient.ts:44–79`; `TasksView.tsx:284–299`; `useBackgroundNotifications.ts:59–69`. Tasks üç ayrı capability taraması başlatıyor; bildirim turu da üç ayrı tarama yapabiliyor. Bu yol `loadRemoteCapabilities()` in-flight cache'ini kullanmıyor. Tasks/Goals/Automations listeleri ayrı ayrı `projects.list` ister.
  - Etki: her makineye birden çok aynı `environment.describe`/`projects.list` RPC'si; view ve bildirim döngülerinde ek tekrar.
  - TODO: tek descriptor/proje snapshot'ından capability filtreleme, in-flight dedup ve TTL/revision invalidation; offline sağlık bilgisini ortak kullan.
  - Kabul: bir board/bildirim turunda makine başına en fazla bir descriptor ve bir proje listesi sorgusu; capability değişimi ve host güncellemesi doğru yenilensin.

- [ ] **P08 — Tasks ve Automations refresh'lerinin üst üste binmesini ve geç cevapları önle. [Kaynak; yarış riski]**
  - Kanıt: `TasksView.tsx:284–315` 15 s interval'de `running`/generation kontrolü olmadan refresh çağırıyor; `AutomationsView.tsx:272–287` benzer. RPC timeout'u 30 s ve refresh çok aşamalı.
  - Etki: yavaş ağda aynı tarama eşzamanlı başlar; eski sonuç yeniyi ezebilir; kapatılan view'in işleri sonuçlanmaya devam eder. Görünürlük kapısı da yok.
  - TODO: completion sonrası planlama veya tek in-flight+trailing refresh; generation/cleanup koruması; gizli view için daha yavaş politika.
  - Kabul: 40 s geciktirilmiş cevap ve manuel yenilemede en fazla bir refresh çalışsın; daha eski cevap state'i ezmesin; unmount sonrasında yayın yapılmasın.

- [ ] **P09 — Yerel host heartbeat/mirror döngülerinin boşta işini azalt. [Kaynak]**
  - Kanıt: `desktopLive.ts:49–60` her heartbeat'te bütün yüklü oturumların approval bloklarını tarıyor; `useDesktopLive.ts:36–70` boş payload olsa da 1,5 s çağırıyor. `useAdoptedSessions.ts:47–58` her pass'te makineleri ve capability'leri yeniden okuyup adopted listesini ister.
  - Etki: dış ağdan bağımsız sürekli IPC, loopback HTTP, dosya okuma ve blok taraması. Birden fazla pencere maliyeti büyütür.
  - TODO: paylaşılan makine/capability cache'i, dirty/live-session index'i ve boşta heartbeat süresi. Hostun 20 s stale eşiğini ve komut teslim sözleşmesini birlikte düzenle.
  - Kabul: boşta ve aktif modun istek/scan sayıları ayrı ölçülsün; boşta maliyet düşsün, bekleyen onay/soru ve remote kontrol korunmalı.

- [ ] **P10 — Bir yavaş hostun tüm kütüphane sync döngüsünü geciktirmesini önle. [Kaynak]**
  - Kanıt: `src/features/sync/model/syncClient.ts:221–235` makineleri sırayla `await` ediyor; `:265` sabit 30 s tur. `:258–263` çalışırken gelen `syncNow()` mevcut turun Promise'ini döndürüyor, istenen yeni turu beklemiyor.
  - Etki: önceki offline makinenin 30 s timeout'u sağlıklı makineyi bekletir; pending döngüler birikir. Kullanıcının sync isteği, talep ettiği makine yeniden sync olmadan tamamlanmış görünebilir.
  - TODO: makine başına scheduler/backoff, sınırlı paralellik ve o makinenin gerçekten tamamlanan turuna bağlı `syncNow()` Promise'i.
  - Kabul: offline A ve sağlıklı B'de B beklemesin; A çalışırken B için `syncNow()` B'nin turu tamamlanmadan resolve olmasın.

- [x] **P11 — Dosya ağacı refresh'ini proje ve izlenen klasörlerle sınırla. [Kod + hedefli test]**
  - Kanıt: `fileTree.ts:8–15`, `:75–85`, `:109–117` global cache'teki **bütün** klasörleri `Promise.all` ile listeler. `FileTree.tsx:848–854` bunu uzak projede 5 s'de bir çağırır. `fileIndex.ts:80–89`, `:388` aynı bildirim sonrası tüm son proje index'ini yeniden ister.
  - Etki: önceki uzak makinelerin kapatılmış klasörleri ve yerel klasörler de tekrar okunur; bir proje poll'u başka makineyi uyandırabilir. Klasör sayısıyla request/FS maliyeti artar.
  - TODO: proje/makine kapsamlı dirty klasör cache'i, yalnızca abonesi/açık klasörleri yenileme, kullanılmayan cache'i bırakma ve index revision kontrolü. Dizinde içerik değişmeden tam index indirme.
  - Kabul: deneyde yenilenen eski makine klasörü artık sorgulanmasın; 100 cache klasörü/10 açık klasörde yalnızca ilgili açık/dirty klasörler yenilensin. Index değişmeyen listede yeniden indirilmesin.

- [ ] **P12 — Adopted session mirror'da bilinen snapshot üzerinden delta al. [Kaynak]**
  - Kanıt: `useAdoptedSessions.ts:57–59` `loadRemoteSession(machine.id, sessionId)` çağrısına bilinen snapshot vermiyor. `connections.ts:242–255` bilinen revision olmayınca full sync ister.
  - Etki: host revision ilerledikçe açık yerel adopted konuşma bütün geçmişi 5/20 s'de yeniden alabilir; normal RemoteSession delta avantajını kullanmaz. Bu trafik loopback'tir ama JSON/IPC/RAM maliyeti vardır.
  - TODO: mirror başına bounded snapshot/revision cache'i; delta ve yalnızca bozuk base'de full fallback. State apply ile cache sürümünü eşleştir.
  - Kabul: 10 MB geçmişte son bloğun küçük değişikliği tekrar 10 MB indirmesin; reconnect/base uyuşmazlığında doğru full recovery yapılsın.

- [x] **P13 — Görsel önizlemeleri görünür ihtiyaca göre indir ve başarısız indirmeyi yavaşlat. [Kod + hedefli test]**
  - Kanıt: `remoteAttachmentPreviews.ts:18–78` geçmişteki bütün uygun görselleri nested `Promise.all` ile yükler. Hata cache'i yok; download Promise'i tamamlanınca silinir. Değişmeyen revision'da kayıp görsel **5 poll'da 5 kez** tekrar istendi.
  - Etki: off-screen eski görsellerin açılışta toplu transferi; kalıcı eksik eklerde sürekli RPC; base64 snapshot belleği. Tek görsel sınırı 20 MB olsa da toplam concurrency/bellek bütçesi yok.
  - TODO: viewport/on-demand thumbnail, bounded concurrency, başarısız ekler için TTL/backoff ve explicit retry; oturum cache'i için toplam byte bütçesi.
  - Kabul: ekranda olmayan geçmiş görseller açılışta indirilmesin; missing ek her sync'te denenmesin; oturum değişimi ve görünür ekler doğru çalışsın.

- [ ] **P14 — Host streaming kaydında bütün transcript'i sık aralıkla yeniden yazma maliyetini azalt. [Tekrarlandı + Kaynak]**
  - Kanıt: `host/engine.ts:48`, `:493–501`, `:1101–1118`; batch 120 ms. `host/store.ts:30`, `:198–223` senkron SQLite/FULL durability ile bütün snapshot ve event yazar. İzole örnekte yalnızca title değişiminde snapshot kolonu **1.048.917 byte** idi.
  - Etki: uzun konuşmalarda JSON, disk/WAL ve host event loop maliyeti; bir session diğer RPC'leri de geciktirebilir. Gerçek disk latency benchmark'ı yapılmadı.
  - TODO: blok/incremental veya event kaydı, daha seyrek snapshot checkpoint'i ve bounded writer/worker; flush sıklığını veri dayanıklılığı ihtiyacına göre ölç. Durability'yi gerekçesiz kapatma.
  - Kabul: 1/10/50 MB geçmişte sabit küçük delta için serialization/write maliyeti ölçülsün; idle polling latency bozulmasın; crash sonrası onaylanmış içerik korunmalı.

- [ ] **P15 — Yerel canlı oturum kayıt kuyruğunu birleştir ve izleyici talebine göre sınırla. [Kaynak; kuyruk büyümesi riski]**
  - Kanıt: `App.tsx` canlı persistence effect'i 1,5 s'de tüm busy session'ları kontrol edip `void upsertSession` yapıyor; `sessionStore.ts:254–279` tam sanitized payload'ı sıra halinde gönderiyor. `:325–328` fingerprint blok kimlikleriyle zaten iyileştirilmiş; burada eski deep-JSON fingerprint hatası yeniden ileri sürülmüyor.
  - Etki: yerel hostun yalnızca erişilebilir olması sürekli tam kayıt için yeterli; izleyen uzak bilgisayar olup olmadığı kontrol edilmiyor. Disk yetişmezse eski payload'lar seri kuyruğa birikebilir.
  - TODO: session başına tek writer ve en yeni pending snapshot'ı birleştirme; busy/final kayıt önceliği; hostta izleyici talebi varsa uygun cadence.
  - Kabul: disk write'ı 5 s geciktirilince sınırsız eski snapshot kuyruğu oluşmasın; son başarılı içerik, final kayıt, silme ve pencere kapatma sözleşmeleri korunmalı.

- [ ] **P16 — Dekoratif canvas ve RAF döngülerine görünürlük ve iş bütçesi ekle. [Kaynak + Ölçüm]**
  - Kanıt: `TerminalGridBackground.tsx:32`, `:175–237`, `:327–350`: yaklaşık 30 FPS, idle halde **iki** oyun board'unu da step/paint; her paint'te yeni `Float32Array(cols*rows)`. Gizli dokümanda duruyor ama gizli sekmede sıfır boyut kontrolü RAF başladıktan sonra geliyor. `ComposerRunner.tsx:216–233`, `:447–458` enabled=false/hidden dalında bile RAF zincirini schedule etmeyi sürdürüyor.
  - Etki: görünmeyen oyun/runner callback'leri, canvas/grid boyutuyla artan çizim ve allocation/GC maliyeti. Canlı renderer/GPU süreç CPU yükü yüksek; bu bileşenlere nedensel olarak bağlanmadı.
  - TODO: yalnızca aktif/geçiş yapan board'u çiz; stamp buffer'ı yeniden kullan; görünmeyen/disabled bileşende RAF'ı iptal et; düşük kaynak/reduced-motion modu ve ölçülmüş DPR/FPS bütçesi.
  - Kabul: gizli/disabled bileşen RAF üretmesin; boş ekran/çok sekme/aktif streaming için animasyon açık-kapalı CPU karşılaştırması ve trace yapılsın; oyun geçişi ve resume bozulmasın.

- [ ] **P17 — Gizli terminal panellerinin başlık sorgusunu ve Windows'taki sonuçsuz poll'u kaldır. [Kaynak]**
  - Kanıt: `TerminalView.tsx:414–448` görünür dokümanda tüm mount edilmiş terminallerin meta bilgisi için 1 s'de IPC; `active` kontrolü bu effect'te yok. `src-tauri/src/pty.rs:313–321`: Unix `ps` çalıştırır, Windows sürekli `foreground: None` döndürür.
  - Etki: Windows'ta değişmeyecek değer için sürekli IPC; Unix'te gizli terminaller için process spawn. Bu Windows gözlemine Unix `ps` maliyeti yanlış atfedilmemeli.
  - TODO: panel görünürlüğü ve platform capability'siyle gate; Unix'te paylaşılan/toplu veya daha seyrek durum okuması; görünür terminal title güncellemesini koru.
  - Kabul: gizli terminal başlık poll'u üretmesin; Windows desteklenmeyen meta sorgusunu tekrarlamasın; Unix görünür foreground değişimi güncellensin.

- [ ] **P18 — Harness çıktısını her WebView'e yayınlamak yerine ilgili pencerelere yönlendir. [Kaynak; büyük çıktı riski]**
  - Kanıt: `src-tauri/src/harness.rs:934`, `:949`, `:1260` `app.emit` kullanıyor; `src/integrations/harness/core/child.ts:70–73` yayınların her pencereye gittiğini açıklıyor. `:91–107` buffer sınırı **1.000 satır/adet**, byte değil.
  - Etki: pencere sayısıyla bridge serialization/JS callback maliyeti artar; birkaç büyük JSON satırı adet sınırına rağmen yüksek RAM kullanabilir. Sahipsiz child için buffer koruması zaten var ve korunmalı.
  - TODO: session owner/observer registry ve hedefli emit; gerekli observer'lara fan-out; byte sınırı ve geri basınç. Semantic event'leri sessizce düşürme; overflow'da açık recovery.
  - Kabul: tek oturumun çıktısı ilgisiz pencerelere teslim edilmesin; dev satır/stream burst toplam byte bütçesinde kalsın; pencere transferi ve yeniden bağlanma event kaçırmasın.

- [ ] **P19 — RPC timeout'unu uzun Git işlemlerinin sözleşmesiyle eşleştir. [Kaynak]**
  - Kanıt: `remote.rs:150–154` bütün RPC'ler 30 s; `host/git-actions.ts:74` ağ Git işleri 120 s; `host/server.ts:908–922` Git action tamamlanmadan cevap vermiyor.
  - Etki: geçerli 30–120 s Push/Fetch/Pull sürerken istemci timeout alabilir; işlem hostta devam ederken kullanıcı tekrar deneyebilir. Başarısız görünüm ile gerçek sonuç ayrışır.
  - TODO: method bazlı süre veya job/receipt+durum sorgusu; iptal/tekrar/idempotency ve "sonucu belirsiz" recovery davranışı.
  - Kabul: kontrollü 45 s Git işlemi doğru sonucuyla tamamlanabilsin; timeout sonrası sonuç kesinleştirilmeden aynı mutasyon yeniden gönderilmesin.

- [x] **P20 — Kütüphane sync pull için byte sınırlı sayfalama ekle. [Kod + hedefli test]**
  - Kanıt: `host/sync.ts:60–70` tüm rev>N kayıtları tek cevapta; `syncClient.ts:143–154` tek pull. `remote.rs:141`, `:174–181` yanıt sınırı 16 MiB. Sentetik 200 geçerli op ile pull **18.020.083 byte** oldu. Konuşma sync'i zaten `sessions.syncChunk` kullanıyor; bu bulgu farklı olan `sync.pull` yoludur.
  - Etki: büyük ilk/epey geriden sync'te istemci "Host response is too large" alır; aynı büyük cevabı yeniden istemek ilerleme sağlamaz.
  - TODO: cursor/high-water revision ve sınırlı page byte'ları; her sayfayı güvenli uygula, tamamlanmadan global rev'i atlatma.
  - Kabul: toplam 16 MiB üstü kayıtlar küçük sayfalarla tamamlanabilsin; arada yeni yazı/reconnect olduğunda eksik, çift veya atlanmış rev oluşmasın.

- [x] **P21 — Sync payload limitini karakter yerine UTF-8 byte üzerinden uygula. [Kod + hedefli test]**
  - Kanıt: `host/sync.ts:73–84` `MAX_VALUE_BYTES` ile `JSON.stringify(value).length` karşılaştırıyor. 30.032 karakter / **90.032 byte** değer 64 KiB limitine rağmen kabul edildi.
  - Etki: çok byte'lı metinlerde sınır aşılır; disk, parse ve response cap maliyetleri beklenen bütçeyi aşar.
  - TODO: `Buffer.byteLength(..., 'utf8')` eşdeğeri byte hesabı; tek kayıt ve toplam batch limitleri; reddedilen op için görünür hata/recovery.
  - Kabul: ASCII/Türkçe/CJK/emoji ile byte sınırının altı kabul, üstü kontrollü ret; geçerli outbox girdileri sessizce kaybolmasın.

- [ ] **P22 — Erişilemeyen makinenin Tasks/Goals/Automations kartlarını son başarılı değerle koru. [Kaynak]**
  - Kanıt: `taskClient.ts:249–265`, `goalClient.ts:161–174`, `hostAutomationClient.ts:208–237` makine hatasında `[]` döndürür; view'ler bunu başarılı birleşik sonuç gibi state'e yazar. "Son bilinenleri tut" catch'i burada çalışmaz çünkü hata alt katmanda yutulur.
  - Etki: kısa ağ kesintisinde kartlar/selection kaybolabilir; boş board ile erişilemeyen host ayırt edilmez.
  - TODO: makine başına `{data,status,error}` sonuç/cache; başarılı boş listeyi hata boşluğundan ayır; stale/offline göstergesi ve kurtarma.
  - Kabul: dolu board sonrası bir hostu erişilemez yapınca kartlar stale olarak kalsın; gerçekten boş başarılı cevap listeyi temizlesin; reconnect güncel kartları getirsin.

### P2/P3 — Trafik politikası ve doğrulama

- [ ] **P24 — Kaynak kullanımına göre ortak polling politikası ve ölçüm ekle. [Ölçüm; kaynakta dağıtık politika]**
  - Kanıt: envanterdeki birbirinden bağımsız döngüler. Özellikle `useInboxUnseen.ts:380–388` tray/minimize halinde 30 s **force** refresh; `githubTasks.ts:656–678` TTL yalnızca force değilse kullanılır. `:688–759` çoklu repo işlerindeki paralellik sınırsız, farklı sağlayıcıların aşamaları sıralı.
  - Etki: Inbox otomasyonları etkin olmasa da tarama sürer; farklı feature'ların toplam bütçesi görünmüyor. Bir yavaş sağlayıcı tüm Inbox refresh süresini büyütebilir. In-flight dedup ve bazı visibility kapıları zaten var; bunlar tamamen yokmuş gibi değerlendirilmemeli.
  - TODO: gerekli bildirim/otomasyon aboneliğiyle background tarama; görünür/arka plan/boşta/offline policy ve makine bazlı concurrency+jitter. IPC/RPC method bazında count, süre, request/response byte, cache hit, retry ve queue depth sayaçları ekle. Token/payload içeriği kaydetme.
  - Kabul: local-only, 1/5 uzak proje, 0/5 aktif turn, 1/3 pencere, minimize ve bağlantı kesintisi için 5'er dakikalık baseline oluştur; kritik komut/notification teslim sürelerini ürün sözleşmesine bağla. Aynı senaryoda önerilen ilk hedef, boşta uzak istek sayısını ve byte'ı baseline'a göre en az %80 azaltmak; bu **önerilen kabul hedefidir, elde edilmiş sonuç değildir**. Renderer/GPU trace'iyle P16 dahil gerçek CPU kaynaklarını ayır.

- [ ] **P25 — Windows host testlerindeki aralıklı cleanup/connection hatalarını araştır. [Gözlendi; tekil tekrarda geçiyor]**
  - Kanıt: hedefli host koşusunda 44/46 test geçti; `desktopSessions.test.ts` cleanup `:88` EBUSY aldı; `server.test.ts:569` `search_project` isteği ECONNRESET aldı. İki başarısız test tekil odaklı tekrar koşusunda geçti. `host/vitest.config.ts:9–14` mevcut 30 s Windows bütçesi ve seri suite davranışı zaten var.
  - Etki: başarısız tam doğrulama ve geçici test dizinleri. Kalıcı ürün hatası veya belirli bir root cause olduğu henüz kanıtlanmadı.
  - TODO: cleanup öncesi bütün Git/provider işlerini drain etme ve handle/process-tree kanıtı; keep-alive/reuse/idle timing için HTTP tracing; assertion timeout'u körlemesine büyütmeden asıl kaynak sahibini bul.
  - Kabul: aynı iki testin en az 20 seri tekrarı ve host suite'i temiz geçsin; bitince test child/process/port ve açık dizin handle'ı kalmasın. Başarısız ilk koşu geçmişten silinmesin.

- [ ] **P26 — Mac'te yeni pencere açma akışındaki native çökmesini araştır. [Canlı crash kaydı; kesin kök neden açık]**
  - Kanıt: 0.8.42 kurulum doğrulamasında `monocode-2026-10-03-205523.ips` SIGABRT; faulting stack Rust foreign-exception cleanup ve Tokio blocking task içinde `monocode_lib::open_new_window` içeriyor. `src-tauri/src/lib.rs:218–221` pencere açmayı `spawn_blocking` içinde çağırıyor. Sonraki kontrollerde uygulama çalışıyordu; her açılışın çöktüğü iddia edilmez.
  - Etki: yeni pencere/oturum transferi sırasında bütün uygulama kapanabilir. Native exception'ın tam kaynağı ve hangi kullanıcı akışının tetiklediği henüz kesinleşmedi.
  - TODO: macOS yeni pencere ve transfer akışını tekrar üret; native exception/backtrace ile AppKit thread kullanımını ayır. Pencere/decorations kurulumunu gerekiyorsa ana thread'e taşı; Windows webview deadlock korumasını koru.
  - Kabul: Mac'te yeni pencere ve pencereye transfer en az 20 tekrar boyunca çalışsın; crash oluşmasın, oturum korunmuş olsun; Windows'ta aynı akış deadlock üretmesin.

## Önerilen sıra

1. P23'ün kalan atomik saklama korumasını ve P05 host işlerini tamamla; P24 temel sayaçlarıyla gerçek kaynak kazanımını ölç. P01 kullanıcı talimatıyla kapsam dışı.
2. P03–P11: ortak connection/cache/polling altyapısı ve görünürlük; önce çift/sınırsız sorguları kaldır.
3. P12–P15, P18–P21: payload, persistence ve uzun işlem sözleşmeleri.
4. P16–P17: ölçümle doğrulanan renderer/terminal maliyeti; P22 offline görünüm ve P25 test güvenilirliği.

## İlk incelemede çalıştırılan doğrulamalar

- Frontend: uzak bağlantı/sağlık/rail/heartbeat/adopted-session/RemoteSession/updater polling seçili **7 dosyada 80/80 test** geçti (`--maxWorkers=1`).
- `npm exec -- tsc --noEmit` ve `npm exec -- tsc --noEmit -p host/tsconfig.json`: ikisi de exit 0. Bunlar o anki çalışma ağacına ait; sonradan devam eden kullanıcı değişikliklerine derleme garantisi vermez.
- Host: seçili mevcut **5 dosyada 44 passed / 2 failed**. İki başarısız testi hedefleyen ayrı koşu **2 passed / 27 skipped**; ilk koşu tamamen başarılı sayılmadı.
- [İzole probe betiği](performance-validation-2026-10-03/probes.mjs) **9 sentetik kontrolü** tamamladı; [sonuç JSON](performance-validation-2026-10-03/probes.json). Testler mevcut sorun davranışını doğruluyor; düzeltme veya green regression kanıtı değildir. React hook/IPC probe'ları sahte bağımlılıklarla call count/routing ölçer; gerçek UI/network testi değildir.
- [Pasif süreç ölçümü](performance-validation-2026-10-03/process-samples.json): gerçek çalışan MonoCode ve alt süreçleri; CPU/bellek gözlemi. Native UI profili, heap snapshot, gerçek uzak byte ölçümü, tam Rust build/test ve bütün uygulama testleri yapılmadı.

İlk inceleme yalnızca TODO ve kanıt dosyaları ekledi. Sonraki uygulama grubunun güncel durumu yukarıdaki tabloda ve aşağıdaki doğrulama kaydındadır.

## İlk uygulama grubunun doğrulaması

- Frontend: seçili **12 dosyada 152/152 test** geçti, tek worker kullanıldı. [Son koşu JSON](performance-validation-2026-10-03/implementation-frontend-final.json). Kapsam: pencere sahipliği/ACK, mirror çatışmaları, polling politikası, liste cache'i, önizleme bütçesi ve kullanıcı isteğiyle yükleme, dosya ağacı/index, sayfalı sync/checkpoint ve geçersiz outbox kayıtları.
- İlk frontend koşusunda **151/152** geçti. Toplu sync testi hedeflenen 100 kayda eklenen iki normal düzen kaydını da sayıyordu; assertion hedef kayıt kimliklerini sayacak şekilde düzeltildi. [İlk koşu JSON](performance-validation-2026-10-03/implementation-frontend.json) korunuyor.
- Host: `desktopLive`, `sync`, `server`, `desktopSessions` seçili **4 dosyada 46/46 test** geçti. [Koşu JSON](performance-validation-2026-10-03/implementation-host.json). Bu tek başarılı koşu, P25'in 20 tekrar ve süreç/handle incelemesi kabulünü tamamlamaz.
- Native: `cargo test -p monocode --lib remote::tests --jobs 2 -- --test-threads=1` ile **11/11 test** geçti. Yeni yerel TCP testi iki RPC'nin aynı bağlantıyı kullanmasını ve ikinci istekte kimlik bilgilerinin değişebilmesini doğruluyor.
- `npm run host:build` ve `npm run build` başarılı. Vite iki CSS `::highlight` uyarısı ve 500 kB üstü bundle uyarıları verdi; bundle küçültme bu grupta tamamlanmadı.
- `rustfmt --check --edition 2021 src-tauri/src/remote.rs` ve `git diff --check` başarılı.
- `cargo clippy -p monocode --lib --jobs 2 -- -D warnings` başarılı değil: bu grupta değiştirilmeyen `src-tauri/src/pty.rs:187` ve `:476` için `too_many_arguments`, `src-tauri/src/rate_limits.rs:435` için `result_large_err` olmak üzere üç lint engeli var. Native test başarısı tam Clippy başarısı olarak sunulmuyor.
- Kurulu uygulama güncellenmedi, gerçek uzak host yeniden başlatılmadı veya değiştirilmedi. Yeni kodla gerçek çoklu pencere/minimize senaryosu, CPU/heap ve istek/byte karşılaştırması yapılmadı. Testlerdeki çağrı sayısı, bütçe ve veri tutarlılığı sonuçları runtime performans kazanımı yerine geçmez; bu doğrulama P24'te açık.
