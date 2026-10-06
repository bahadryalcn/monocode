# İki host arasında düşük kaynak tüketimli session erişimi

Tarih: 2026-10-05
Durum: Yerel implementasyon ve odaklı entegrasyon doğrulaması tamamlandı. Fiziksel iki makine kabulü ve canlı kaynak ölçümleri beklemede; işaretlenmemiş maddeler tamamlandı sayılmaz.

## Amaç ve mimari

MacBook ve Windows PC bağımsız hostlardır. Bazı projeler MacBook'ta, bazıları Windows'tadır. Her MonoCode kendi hostuna yerel, diğer hosta uzak istemci olarak bağlanır. Bir makinenin kapanması diğerindeki yerel işleri durdurmaz.

Hedef: hızlı session açılışı, düşük boşta CPU, sınırlı bellek/disk kullanımı ve minimum ağ trafiği. Her session'ın tek sahibi ve tek yazma otoritesi vardır. İki arayüz aynı session'a bağlandığında agent ikinci kez başlatılmaz.

- Normal uzak proje akışında session ve agent, projenin hostunda bulunur.
- Yerel agent SSH/MCP ile başka makinede işlem yapıyorsa session'ın sahibi yerel makine olarak kalabilir. Session sahibi, agent çalıştırıcısı ve proje konumu ayrı kavramlardır.
- Bu ikinci senaryoda karşı makineye yalnızca açıkça ilişkilendirilmiş session özeti ve gerektiğinde içerik sunulur. Her SSH komutundan otomatik proje/session ilişkisi çıkarılmaz.
- Çalışan agent'ın makineler arasında devri ayrı kapsamdır.
- Projeler ve bütün sohbet geçmişleri iki makineye topluca kopyalanmaz.
- Mevcut host, veritabanı, SSH ve kimlik doğrulama kullanılır. Yeni merkezi sunucu veya mesaj aracısı gereksinimi varsayılmaz.

## Mevcut dayanaklar ve çalışma kuralları

Kaynak incelemesinde `sessions.page`, `sessions.sync`, `sessions.syncChunk`, `sessions.longPoll`, ortak session listeleri, remote outbox ve performans izleri mevcut. Yeni session bunları güncel kaynakta doğrulamalı ve genişletmelidir.

İlgili başlangıç noktaları:

- `host/server.ts`, `host/revisionWait.ts`
- `src/features/connections/model/connections.ts`
- `src/features/connections/model/remoteSessionLists.ts`
- `src/features/connections/model/remoteOutbox.ts`
- `src/features/connections/ui/RemoteSession.tsx`
- `src/shared/lib/performanceTrace.ts`
- `src-tauri/src/remote.rs`
- `docs/remote-access.md`, `docs/host-session-refresh-plan.md`
- `docs/performance-scenarios-2026-10-05.md`

Çalışma ağacında başka işlere ait değişiklikler vardır. Başlangıçta Git durumunu kaydet; mevcut değişiklikleri koru. Bu belge commit, push, yayın, kurulum, host durdurma veya veri temizleme yetkisi vermez. Windows shell çağrılarında `tty=true` kullan. Paket yöneticisi için packageManager ile sabitlenmiş pnpm sürümünü kullan.

## 1. Başlangıç ölçümleri — P0

- [ ] MacBook → Windows ve Windows → MacBook yönlerini ayrı değerlendir.
- [ ] Bağlantı kurulması, liste yüklenmesi, ilk içerik ve gönderime hazır olma sürelerini ayrı ölç.
- [x] Küçük, uzun ve büyük araç çıktılı session örnekleri belirle.
- [ ] İki uygulama boşta açıkken CPU, bellek, ağ trafiği ve sorgu sayısını kaydet.
- [ ] Aktif agent sırasında alınan veri ve ekran güncelleme sıklığını ölç.
- [x] Yinelenen session, liste, durum ve Git sorgularını belirle.
- [x] Mevcut performanceTrace altyapısını kullan; kayıt miktarını sınırla ve hassas içerik kaydetme.
- [x] Canlı erişim yoksa tekrarlanabilir yerel fixture/benchmark hazırla; canlı başlangıç ölçümünü açıkça beklemede bırak.

Kabul: Ağ, host, veri çözümleme ve ekran çizimi maliyetleri ayrı raporlanabilir olmalı. Ölçülmeyen kazanımlar iddia edilmemeli.

## 2. Host ve session sahipliği — P0

- [x] Mevcut kimliklerden makineler arası benzersiz session referansı oluştur.
- [x] Session sahibi, agent çalıştırıcısı ve proje konumunun sözleşmesini yaz.
- [x] Normal uzak projede session ve agent'ı projenin hostunda tut.
- [x] Yerel agent + uzak araç kullanımında mevcut session sahipliğini koru.
- [x] Session'a yazmaları sahibi host üzerinden sırala.
- [x] İki cihazın eşzamanlı gönderiminde kuyruk/steer davranışını mevcut provider kurallarıyla tanımla.
- [x] Masaüstü uygulamasından bağımsız host/iş yaşam döngüsünü doğrula.
- [x] Yerel, uzak, adopted ve kopyalanmış session kayıtları için uyumluluğu belirle.
- [x] Session erişimi ve aboneliklerde mevcut eşleştirme/yetkilendirme sınırlarını koru.

Kabul: Aynı session iki cihazda aynı işe bağlanmalı; ikinci agent veya bağımsız yazılabilir kopya oluşmamalı.

## 3. İhtiyaç oldukça geçmiş — P0

- [x] İlk açılışta yalnızca son konuşma sayfasını getir.
- [x] Sayfalara blok sayısı ve bayt sınırı koy; tek dev bloğu da ele al.
- [x] Bütün geçmişi otomatik indiren döngüyü kaldır.
- [x] Eski mesajları yukarı kaydırınca getir; tekilleştirme, iptal ve tekrar denemeyi yönet.
- [x] Eski sayfa eklenirken kaydırma konumunu koru.
- [x] İlk görünüm yüklenmesi ile eski sayfa yüklenmesini ayrı durumlar yap.
- [x] İlk görünüm hazır olunca geçmişten bağımsız gönderimi aç; diğer gerçek gönderim engellerini koru.
- [x] Kısmi geçmişin tam session gibi kaydedilip eski mesajları silmesini önle.
- [x] Kısmi geçmiş üzerinde delta uygulama, silme ve güncelleme semantiğini tanımla.
- [x] Sayfalama sırasında yeni mesaj gelmesi, revision değişmesi ve tekrar/eksik blok durumlarını çöz.
- [x] Eski sayfa alınırken canlı akışın durmamasını sağla.
- [x] Büyük araç çıktıları ve ekleri önizleme + isteğe bağlı içerik olarak yükle.

Kabul: Uzun session tüm geçmişi indirmeden kullanılmalı. Geçmiş yükleme sırasında gönderim ve canlı çıktı devam etmeli; kayıt kaybı olmamalı.

## 4. Ortak bağlantı ve abonelikler — P1

- [x] Ekranlardan bağımsız makine bağlantı yöneticisi oluştur.
- [x] Mevcut güvenli taşıma üzerinde kalıcı olay kanalı ekle; taşıma seçimini mevcut Rust/host altyapısına göre gerekçelendir.
- [x] Makine başına ortak kontrol/olay bağlantısında session, proje ve görev bildirimlerini taşı.
- [x] Pencereler ve sekmeler arasındaki bağlantı/abonelik paylaşımını masaüstü katmanında düzenle.
- [x] Liste için yalnızca değişen özetleri gönder.
- [x] Sohbet içeriğine görünür sohbetler için abone ol; görünmeyenlerde durum özetini koru.
- [x] Aboneliği referans sayısıyla yönet; son tüketici ayrıldığında kaynakları bırak.
- [x] Kanal sağlıklıyken yinelenen periyodik liste/session sorgularını kaldır.
- [x] Eski hostlar için capability kontrolü ve sınırlı sorgulama fallback'i sağla.
- [x] Yeniden bağlantıyı tek noktadan, artan bekleme ve jitter ile yönet.
- [x] Büyük içerik aktarımının gönder/durdur/onay komutlarını bekletmesini önle; gerekirse ayrı sınırlı veri aktarımı kullan.
- [x] Dosya/Git takibini aynı proje için tekrar tekrar başlatma; değişiklikleri ilgilenen tüketicilere dağıt.

Kabul: Boşta sorgu ve bağlantı sayısı session sayısıyla doğrusal artmamalı. Birden fazla ekran aynı veriyi ayrı istememeli.

## 5. Delta aktarımı ve kopma sonrası devam — P1

- [x] Olay sıra numarası, session revision ve host yeniden başlama kimliğini tanımla; mevcut alanları mümkün olduğunca kullan.
- [x] Mesaj ekleme, metne ekleme, blok değiştirme/silme ve durum değişimi olaylarını tanımla.
- [x] Tüm session yerine gereken değişen alanı aktar.
- [x] Snapshot alma ile abonelik başlatma arasında olay kaybını önleyen tutarlı başlangıç noktası kur.
- [x] İstemcide son uygulanmış sıra numarasını tut; sıra boşluklarını fark et.
- [x] Yeniden bağlanınca eksikleri sırayla al; tekrarları güvenle atla.
- [x] Olay saklama boyutu/süresini sınırla; aralık dışındaki istemciyi güncel görünümden toparla.
- [x] Mevcut outbox ve komut kimliğini kalıcı tekilleştirmeyle doğrula.
- [x] Host kaydettiği halde yanıt kaybolursa yeniden gönderimin ikinci çalışma başlatmasını önle.
- [x] Çökme/yeniden başlama sonrası belirsiz komut durumunu sorgula; doğrulanmamış dış yan etkileri körlemesine tekrarlama.
- [x] Taslak, ek, model/effort seçimi, sıra ve açık onayları koru; composer'ı yeniden mount etme.

Kabul: Kopma sonrasında eksiksiz toparlanma ve yinelenen komutta güvenli davranış. Host yeniden başlatma ve eski event aralığı da test edilmeli.

## 6. Kaynak bütçeleri ve çizim — P1

- [x] Makine/session bazlı sınırlı önbellek kur; eski kayıtları çıkar.
- [x] Kalıcı önbellekte özetleri ve son kullanılan sayfaları tut.
- [x] Büyük içeriğin gereksiz bellek/disk kopyalarını önle.
- [x] Kalıcı kayıtları arayüzü bekletmeden küçük gruplar halinde yaz.
- [x] Canlı metin parçalarını kısa aralıklarla birleştir.
- [x] Bir blok değiştiğinde tüm sohbet/listenin tekrar işlenmesini önle.
- [x] Görünen mesajlarla sınırlı çizim uygula; seçim, arama, erişilebilirlik ve kaydırmayı koru.
- [x] İstemci gönderim kuyruğuna sınır ve backpressure ekle.
- [x] Birleştirilebilir durum olaylarını birleştir; konuşma olaylarını sessizce kaybetme.
- [x] Kapanan pencere/aboneliklerin timer, listener ve içeriklerini serbest bırak.

Başlangıç bütçeleri ölçümle somutlaştırılacak: boşta yalnızca bağlantı kontrolü; sayfalarda hem blok hem bayt sınırı; yaklaşık 50–100 ms canlı güncelleme birleştirmesi; bellek/disk/olay kuyruğunda açık üst sınır. Bunlar ölçülmüş performans sonucu değildir. Sayısal üst sınırları gerçek fixture ve makinelerle seç, rapora kaydet.

Kabul: Uzun kullanımda bellek sürekli büyümemeli; kapalı session sayısı içerik işleme maliyetini katlamamalı.

## 7. Ortak yerel/uzak erişim — P2

- [x] Liste, geçmiş, gönder, durdur, onay ve durum takibi için ortak erişim sözleşmesi kur.
- [x] Yerel doğrudan host adaptörü ve uzak bağlantı adaptörü kullan.
- [x] Sohbet ekranındaki dağınık yerel/uzak koşullarını bu katmana taşı.
- [x] Proje/session sahibi makineyi ve çevrimdışı önbellek durumunu açık göster.
- [x] Erişilemeyen makinenin diğer yerel projeleri bekletmesini önle.
- [x] Silme, arşivleme ve yeniden adlandırmayı iki arayüzde tutarlı yap.

Kabul: Yerel/uzak işlemlerin kullanıcı davranışı tutarlı; host kopması diğer hostun yerel işlerine engel değil.

## 8. Doğrulama ve geçiş — P2

- [x] Sayfalama + canlı mesaj + silme + yeniden bağlantıyı birlikte test et.
- [x] Eşzamanlı iki istemci, yinelenen komut ve yetkisiz abonelik testlerini çalıştır.
- [ ] Gecikme, düşük bant genişliği, kesilme ve yavaş tüketiciyi test et.
- [ ] Uyku/uyanma, uygulama ve host yeniden başlamasını test et.
- [x] Eski/yeni uygulama-host capability eşleşmelerini doğrula.
- [x] Kayıt/önbellek geçişi ve geri dönüş davranışını veri kaybı açısından doğrula.
- [ ] Aynı veri/koşullarla başlangıç ölçümlerini tekrarla; süre, CPU, bellek, istek ve bayt sonuçlarını yaz.
- [ ] Her iki yönde gerçek iki mesajlı sohbet ve kod değişikliği kabulünü yap; erişim/kurulum yetkisi yoksa beklemede işaretle.
- [ ] Yerel kurulum istendiğinde `docs/local-update.md` ve `scripts/update-local.ps1` kullan; önce planı incele.
- [ ] Kurulan app/host sürümlerini ayrı doğrula; scheduled/waiting durumunu tamamlandı sayma.

## Teslimat sırası ve durum kaydı

1. Ölçüm ve sözleşme: 1–2.
2. Hızlı açılış: 3.
3. Ortak bağlantı ve güvenilir delta: 4–5.
4. Kaynak bütçeleri ve ortak erişim: 6–7.
5. Entegrasyon, karşılaştırmalı ölçüm ve izinli canlı kabul: 8.

Bağımlı işleri protokol sözleşmesi sabitlenmeden paralel yazma. Her kutuyu yalnızca ilgili kanıt varsa tamamla. Kod/test doğrulaması ile iki fiziksel makine ve kurulum kabulünü ayır.

Uygulama boyunca bu belgenin sonuna kısa kayıt ekle:

| Aşama | Durum | Değişen dosyalar | Kontrol/ölçüm kanıtı | Açık engel |
|---|---|---|---|---|
| 1 | Yerel fixture ve izler tamamlandı | `scripts/remote-session-benchmark.{ts,mjs}`, `performanceTrace.ts` | Aynı fixture ile son 20 tekrar; [ölçüm kaydı](remote-session-performance-evidence.md) | İki yönde canlı bağlantı/gönderim/CPU/bellek/ağ ölçümü yok |
| 2 | Sahip-host sözleşmesi ve yerel doğrulama tamamlandı | `protocol.ts`, `sessionAccess.ts`, `remote-session-protocol.md` | Kimlik çakışması, iki bağımsız loopback host, aynı komutun iki istemciden tek uygulanması | Fiziksel iki cihaz kabulü yok; eski masaüstü agent yaşam döngüsü taşınmadı |
| 3 | İhtiyaç oldukça geçmiş tamamlandı | `transcriptPage.ts`, `connections.ts`, `RemoteSession.tsx`, `AgentTranscript.tsx` | Sayfa bütçesi, silinen ilk bloktan sonra pencere, geçmiş sırasında Send, gecikmiş eski sayfa/canlı revision yarışları | Fiziksel scroll/paint ölçümü yok |
| 4–5 | Ortak kanal ve toparlanma tamamlandı | `remoteChanges.ts`, `remote_changes.rs`, `remoteMachineChannel.ts`, `remoteSessionLists.ts`, `store.ts`, `remoteOutbox.ts` | Native 19; host metadata/sayfa/receipt; yeniden başlama/auth, outbox recovery, bağımsız komut hattı | Gerçek uyku/uyanma ve ağ koşulları ölçülmedi |
| 6–7 | Kaynak bütçeleri ve ortak erişim tamamlandı | `remotePageCache.ts`, `remoteSummaryCache.ts`, `remoteQueue.ts`, `sessionAccess.ts`, `Sidebar.tsx`, `taskClient.ts` | Cache schema/TTL/owner/bütçe, kuyruk/outbox backpressure, kısmi kaydı reddetme, Sidebar 65, görev ekranı 35 | Gerçek IndexedDB motoru/disk boyutu ve uzun kullanım heap profili ölçülmedi |
| 8 | Yerel entegrasyon tamamlandı; canlı kabul bekliyor | `remote-performance.integration.test.ts`, ilgili renderer/host/native testleri | Host entegrasyon 6; renderer ve host TypeScript; yerel host bundle; son kontrol ayrıntıları aşağıda | Kurulum ve fiziksel MacBook–Windows kabulü görev kapsamında yetkilendirilmedi |

## Luna alt ajanlarıyla çalışma düzeni

Yeni session'ın ana ajanı koordinasyonu, protokol kararlarını, entegrasyonu ve son incelemeyi üstlenir. Kullanıcı bu iş için Luna alt ajanlarıyla delegasyonu açıkça istemiştir.

- Alt ajanları `model: "gpt-6-luna"`, `reasoning_effort: "medium"`, `fork_turns: "none"` ile başlat; her birine gerekli bağlamı ve bu dosyanın yolunu ver.
- Luna kullanılamıyorsa farklı modele sessiz geçme; engeli bildir.
- En fazla üç alt ajanı aynı anda çalıştır. Aynı dosyaya eşzamanlı yazıcı verme.
- Her atamada dosya/modül sahipliği, beklenen çıktı, kabul kontrolleri ve bağımlılıklar açık olsun.
- Her ajana başka ajanların da çalıştığını, başkasının değişikliğini geri almaması ve mevcut dirty işleri koruması gerektiğini söyle.
- Alt ajanlar yeni alt ajan başlatmasın. Ortak dosya değişikliklerini ana ajan koordine etsin.
- İlk keşif dalgası: host/protokol; istemci/geçmiş; ölçüm/test kapsamı. Bu dalga salt okunur, sonuçlar kısa ve kaynak konumlu olsun.
- Uygulama dalgalarında host, istemci ve doğrulama sahipliğini ayır. Ortak tipler/sözleşmeler ana ajan tarafından sabitlensin.
- Test ve inceleme görevini aynı dosyada implementasyon süren ajanın üzerine bindirme; hazır değişiklikleri incelet.
- Her dalgada anlamlı testleri çalıştır, kanıtı kaydet ve sonraki aşamaya ilerle. Yalnızca analiz veya ilk aşama sonunda işi bırakma.

## Araştırma kaynakları

- VS Code Remote: https://code.visualstudio.com/docs/remote/ssh
- JetBrains Split Mode: https://plugins.jetbrains.com/docs/intellij/split-mode-and-remote-development.html
- Zed Remote Development: https://zed.dev/docs/remote-development
- Slack ihtiyaç oldukça yükleme (tarihsel mühendislik deneyimi): https://slack.engineering/making-slack-faster-by-being-lazy/
- Slack gerçek zamanlı mimari: https://slack.engineering/real-time-messaging/
- Neovim toplu UI olayları: https://github.com/neovim/neovim/blob/master/runtime/doc/api-ui-events.txt
- Ably kopma sonrası devam: https://ably.com/docs/platform/architecture/connection-recovery

Bu kaynaklardan alınan ilkeler MonoCode'a uyarlanacaktır; ürünlerin bütün altyapısını kopyalama gereksinimi yoktur.

## Yerel teslimat ve kanıt sınırları — 2026-10-05

### Ek kabul: uzak içerik yükleme ve yenileme durumları

- [x] Uzak session listesinde ilk yükleme, son veriyi koruyan yenileme, hata/tekrar deneme, doğrulanmış boş sonuç ve güncel sonuç ayrılır. TTL içindeki manuel yenileme de owner okuması yapar; eşzamanlı okumalar birleşir. Kanıt: `SidebarRemoteSessions.test.ts`, `remoteSessionLists.test.ts`.
- [x] Makine kayıt listesinin okunamaması başarılı boş liste sayılmaz. Klasör gezgininde bekleyen/hatalı gezinme eski klasörü açıkça etiketler; yanlış eski klasörü açma engellenir ve retry istenen klasörü okur. Kanıt: `AddRemoteProjectDialog.test.ts`.
- [x] Sohbet, görev panosu ve dosya ağacının durum/yenileme entegrasyonu ve son regresyon kontrolleri tamamlandı. Sohbet 63, görev 38, dosya modeli/arayüzü 44 test; session/bağlantı entegrasyonu 102 test ve reset sonrası etkilenen alt grup 77 test geçti (gruplar örtüşür). Son `tsc --noEmit` başarılı. Ayrıntılar: `docs/remote-session-performance-evidence.md`, “Remote content loading states” bölümü.
- [x] Ek arayüz değişiklikleri Windows x64 ve Mac arm64 için 0.9.0 olarak yeniden derlendi ve paketler doğrulandı. Ortak snapshot/paket: `9945af19ebcbf1d5-local`; kanıt ve stage süreleri evidence dosyasındaki “0.9.0 build refresh” bölümündedir. BuildOnly kurulum yapmadı.
- [ ] Bu ek arayüz değişiklikleri paketlenmiş Windows/MacBook uygulamalarında fiziksel olarak kabul edildi. Önceki 0.9.0 paket/kurulum kaydı bu ek değişikliklerin kurulduğu anlamına gelmez.

İşaretli kutular yerel kod/sözleşme/test kapsamını gösterir. Uçtan uca fiziksel kabul, kurulu sürüm, boşta CPU, WebView heap, paint veya gerçek ağdaki hız kazanımı anlamına gelmez. Canlı erişim ve kurulum bu görevde kullanılmadı. Üç Luna ajanı (`gpt-6-luna`, medium, bağımsız bağlam) ayrı host, istemci ve doğrulama sahipliğiyle çalıştı; ortak tipler/native taşıma, entegrasyon ve son kaynak incelemesi ana ajan tarafından yönetildi. Başlangıçtaki dirty değişiklikler korundu; proje commit/push/yayın/kurulum veya çalışan host durdurma yapılmadı.

### Teslim edilen davranışlar

- Owner `(environmentId, sessionId)`; aynı hostun durable komut ID'si ve mevcut provider busy/queue/steer kuralları tek agent/yazma otoritesini korur. Bir hostun kopması diğer hostun yerel işi için fallback veya kopya oluşturmaz.
- Yeni istemci yalnızca son sayfayı ister; eski sayfa açık talep/yukarı kaydırma ile yüklenir. 100 blok/1 MiB sayfa, 64 KiB blok önizlemesi ve revision'a bağlı tam çıktı okuması vardır. Eski uygulama yeni hosta `preview:true` göndermiyorsa tam sayfa sözleşmesi korunur.
- Geçmiş ve tam blok okuması ayrı tutulur; gecikmiş sayfa canlı revision'ı geri alamaz, aynı revision'daki kontrol okuması genişletilmiş görünümü daraltamaz. Kısmi görünüm authoritative yerel kayıt üzerine yazılmaz. Composer, taslak ve model seçimi bu okumalar için remount edilmez.
- Session/proje/görev metadata'sı makine başına ortak uzun beklemeli kontrol hattındadır. Renderer referans sayımı ve native pencereler arası birleşim, TTL ve kaynak sınırları kullanılır. Görünmeyen yeni-host sohbetleri içerik sorgulamaz. Değişmiş özet satırları aktarılır; eşdeğer eşzamanlı salt okunur istekler birleştirilir; yazmalar ve büyük içerik ayrı hatta ilerler.
- Session revision ve host `instanceId` kopma/yeniden başlama durumunu yakalar. Mevcut block revision deltasında ekleme/metin değişimi blok güncellemesidir, eksilen ID silmedir; ayrı sınırsız token olay günlüğü kurulmadı. Eski/gap cursor güncel son sayfadan toparlanır.
- Receipt yedi gün, yeni outbox otomatik tekrar penceresi altı gündür. Belirsiz yan etkiler ve tarihsiz eski outbox için receipt sorgulanır; bilinmeyen riskli komut körlemesine tekrar edilmez. Süresi geçmiş kayıt recovery için görünür kalır.
- Bounded memory/summary/page/transfer cache ve kuyruk/outbox backpressure vardır. Ayrı asenkron IndexedDB son sayfa deposu owner/schema/24 saat TTL ile doğrulanır; disk önizlemesi güncel host okuması gelene kadar gönderim otoritesi değildir. Özet yazmaları key bazında birleştirilip ayrı macrotask'lerde yapılır.
- Hostta silinen session'ın içerik aboneliği ve tekrar timer'ları bırakılır; silinen sohbet gönderim otoritesi kazanamaz. Proje listesinin ortak kanalı diğer session'lar için çalışmaya devam eder.
- Ortak erişim sözleşmesi loopback yerel host ve uzak host adaptörlerinde aynı RPC davranışını sağlar; Sidebar yeniden adlandırma/arşiv/silme ve uzak sohbet yazmaları bu katmanı kullanır. Mevcut doğrudan masaüstü provider oturumları bu işte hosta göç ettirilmedi.
- Mevcut 120 ms provider stream checkpoint birleştirmesi, stabil turn/block memoization, ilk 20 turn penceresi ve `content-visibility` çizimi tekrar kullanıldı. Kaynak sınırları ölçülmüş heap veya disk tüketimi iddiası değildir.

### Değişen dosya grupları

- Host: `host/server.ts`, `host/store.ts`, `host/remoteChanges.ts`, `host/transcriptPage.ts`, `host/sync-transfer.ts`; karşılık gelen testler ve `host/large-sync.test.ts`, `host/remote-performance.integration.test.ts`.
- Native: `src-tauri/src/remote.rs`, `src-tauri/src/remote_changes.rs`.
- Ortak/istemci model: `src/features/connections/model/{protocol,connections,sessionAccess,remoteMachineChannel,remoteSessionLists,remotePreviewBinding,remoteSessionState,remoteOutbox,remoteQueue,remoteSummaryCache,remotePageCache}.ts`; karşılık gelen testler, `remoteSessionLoad.test.ts`, `remoteResourceBounds.test.ts`, `remoteTransportRecovery.test.ts`. Test izolasyonu için `useRemoteQueue.ts` ve `src/features/sessions/model/autoContinue.ts` sıfırlama yardımcıları da güncellendi.
- Arayüz/kayıt: `src/features/connections/ui/RemoteSession.tsx` ve testi; `src/features/sessions/ui/{SessionPane,AgentTranscript}.tsx`, `RemoteBlockPreview.test.ts`; `src/features/sessions/model/session.ts`, `src/features/sessions/data/sessionStore.ts` ve loading testi; `src/app/shell/Sidebar.tsx`.
- Görev/ölçüm: `src/features/tasks/model/taskClient.ts`, `taskChannel.test.ts`, `src/features/tasks/ui/TasksView.tsx`, `src/shared/lib/performanceTrace.ts` ve testi.
- Doküman/benchmark: bu plan, `docs/remote-session-protocol.md`, `docs/remote-session-performance-evidence.md`, `scripts/remote-session-benchmark.ts`, `scripts/remote-session-benchmark.mjs`.
- CPU/RAM follow-up: `scripts/remote-session-resource-benchmark.ts`, `.mjs` ve kalıcı ham kanıt `docs/benchmarks/remote-session-resources-2026-10-05.json`; önceki fixture üretimi dışa aktarılarak ortak kullanıldı.

### Kontroller ve somut açık kabul

Sabitlenmiş `pnpm@12.8.2`, Windows'ta tüm shell çağrılarında `tty=true` kullanıldı. Test komutları mevcut paketleri doğrudan `pnpm exec node node_modules/...` ile çalıştırır; yeni dependency kurulmadı. Host odaklı paket 32/32, yeni server rotaları 3/3, iki-host/receipt/sayfa/kopma entegrasyonu 6/6, transfer bütçeleri 4/4, native remote paketi 19/19 geçti. Sidebar 65/65, görev ekranı 35/35, transport recovery 5/5, cache planner/schema 5/5, özet cache 2/2, kaynak bütçeleri 4/4, protokol 6/6, performanceTrace 3/3 ve partial persistence 4/4 geçti. Aynı testin farklı aliases ile başarı sayısı artırılmadı.

Geniş host server koşusunda üç workspace/Git testi standart 30 saniyede süre aşımına girdi; yalnızca bu üç test tek işçi ve 60 saniye sınırıyla yeniden çalıştırıldı ve 3/3 geçti (41–59 saniye). Bu sonuç baseline karşılaştırması veya Git hız kazanımı değildir. Native derlemede mevcut `checkpoint.rs` dead-code uyarıları vardır; bu görevde değiştirilmedi.

Son tam `RemoteSession.test.ts` koşusu 57/57, büyük blok açık talep DOM kontrolü 1/1 geçti. Ardından silinme işaretinin visibility/recovery effect yeniden başlamalarında korunması ve gecikmiş tam blok/geçmiş sonuçlarının engellenmesi için son küçük guard eklendi; genişletilmiş silme ve gecikmiş geçmiş testleri 2/2, renderer TypeScript tekrar başarılı. Tam UI suite ve Vite bundle bu son guard öncesi doğrulandı; son değişiklik odaklı test ve TypeScript ile doğrulandı. Host TypeScript `--noEmit`, `host/build.mjs`, yerel Vite bundle (46,98 saniye) ve `git diff --check` başarılı. Vite `::highlight` CSS optimizasyonu, Gemini statik/dinamik import ve büyük chunk uyarıları üretti; bunlar düzeltilmiş veya baseline karşılaştırmasıyla değerlendirilmiş sayılmaz. UI koşusunda bazı asenkron testler React `act(...)` uyarısı verdi; assertion'lar geçti. Bundle üretimi kurulum veya kurulu sürüm kabulü değildir.

Yerel fixture 20 tekrar sonucunda ilk görünüm + bir değişiklik yanıtları: küçük 4713 → 4843 bayt (130 bayt ek maliyet), uzun 4926488 → 245933 bayt, 17 MiB araç çıktısı 18023425 → 229396 bayt. İstek sayıları sırasıyla 2→2, 4→2, 9→2. Bu sayılar JSON/chunk yanıtlarıdır; headers, gerçek ağ, host idle CPU, renderer commit/paint veya fiziksel cihaz maliyeti dahil değildir. Tam sayı ve p50/p95 [ölçüm belgesindedir](remote-session-performance-evidence.md).

Bekleyen kutuların nedeni: fiziksel MacBook→Windows ve Windows→MacBook iki mesaj/kod değişikliği; iki uygulama boşta/aktifken CPU, bellek, gerçek ağ ve sorgu profili; gerçek düşük bant genişliği ve uyku/uyanma; native WebView IndexedDB/scroll/paint ve uzun kullanım heap kabulü. Yerel kontrollü gecikme, geçersiz/kesilmiş chunk, long-poll iptali, restart/epoch ve bağımsız komut hattı test edildi; bunlar fiziksel ağ/uyku kabulünün yerine geçmez. Kurulum istendiğinde mevcut coordinator kullanılır; bu işte kurulu app/host sürümü veya scheduled install başarısı iddia edilmez.

### Kullanıcının CPU/RAM kıyası — 2026-10-05

Yerel kaynak benchmark'u eklendi ve aynı JSON-materialized fixture'larla 24 ayrı Node sürecinde çalıştırıldı (4 fixture × tam/sayfalı × 3 tekrar, süreçler sırayla). Güncel Node v22.22.3/pnpm 12.8.2 kullanıldı; her CPU batch'i en az 750 ms sürdü. Her işlem ilk içerik aktarımı + bir delta, gerçek transfer/chunk JSON encode/decode ve production apply helper'larını içerir; doğru revision ve görünen blok sırası tüm koşularda doğrulandı. Tam akışın uzun geçmişte CPU medyanı 40,905 → 1,078 ms/işlem, gözlenen toplam Node RSS'i 214,04 → 98,53 MiB; küçük fixture CPU 0,029 → 0,038 ms ve RSS 44,99 → 46,03 MiB olduğundan küçük sohbette kazanım iddia edilmez. Diğer fixture'lar, tekrar aralıkları ve GC sonrası toplam heap [ölçüm belgesindedir](remote-session-performance-evidence.md#local-cpu-and-ram-comparison--2026-10-05).

Bu sıcak süreç/fixture ölçümüdür: CPU yüzde kullanımı değildir, RSS yalnızca işlem sınırlarında örneklenir ve gerçek tepe değildir. Ortak Node süreci host helper'larını ve istemciyi simüle eder; ölçüm münhasır app/WebView RAM'i değildir. Authoritative tam kaynak iki akışta da tutulur. Ham baseline farkları ve negatif GC delta'sı gizlenmedi; bunlardan kesin istemci tahsisi sonucu çıkarılmaz. Fiziksel cihaz/boşta CPU-RAM/WebView/ağ kabul kutuları bu ek ölçüm nedeniyle işaretlenmedi.
