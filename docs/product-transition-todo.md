> Güncel sahne kararı (2026-10-07): Sahne şeffaf zeminde gri 0/1 karakterlerinden oluşan code arttır. Bize bakan altı farklı amcanın hepsinde çay vardır; orta ikilinin arasında tek sehpalı tavla bulunur. Oda ve dekor yoktur. İki kişi bacak bacak üstüne atar, iki kişi yaslanır. Hareket yalnızca sırayla ve aralıklı çay içme pozlarıdır. Session arkasında aynı çizim düşük opaklıkla gösterilir. Aşağıdaki eski görsel kararlar tarihçedir.

# Bağımsız ürüne geçiş çalışma listesi

## Son sahne kararı: ince piksel kahvehane — 2026-10-07

- SVG amcalar kaldırıldı. Küçük piksellerle kodda çizilen ayrı yüz/kıyafet/oturuşlara sahip yedi karakter ve ayrıntılı kahvehane ortamı kullanılır.
- İki tavla masası, çay sohbeti ve gazete okuma grupları var. Bunlar ortam animasyonudur; etkileşimli oyun veya skor yoktur.
- Kol döndürme/morf yerine ayrı piksel pozları kullanılır. Statik oda önbelleği, poz değişiminde çizim, görünürlük/azaltılmış hareket kapısı ve sohbet arka planı devam eder.
- Önceki SVG kararları bu güncel tercih tarafından değiştirilmiştir.

## Son görsel karar: koyu editör çalışma alanı — 2026-10-07

- Önceki bordo/pirinç arayüz paleti bırakıldı. Varsayılan tema hue 216, saturation 24, dark lightness 4 ve soğuk gri `#A3ACB8`; önceki tam varsayılan palet bir kere taşınır, kişisel renk seçimleri korunur.
- Kabuk ince çalışma şeridi, kompakt proje araçları ve oturum gezinmesiyle yeniden düzenlendi. Yeni görev ekranı üst başlık, görev özeti ve giriş alanı sırasını kullanır.
- Ayarlar kendi üst arama alanına, yatay kategori sekmelerine ve iki kolonlu düz form düzenine sahip; eski sol ayar kategorileri kaldırıldı. Dar ekranlarda tek kolon, sekmelerde klavye gezinmesi korunur.
- Kahvehane SVG'si tek renkli grafit çizime dönüştürüldü; giysi kıvrımları ve yaşlı yüz detayları artırıldı. Aynı sahne aktif oturumların arka planına düşük opaklıkla eklendi. Sahne anahtarı, az hareket tercihi ve gizli oturum kapısı korunur; oyun bulunmaz.
- Bileşenlerin tarayıcı önizlemesi görsel kontrol için kullanıldı. Bu kayıt bütün native ekranların veya kurulu paketlerin kabulü anlamına gelmez.

Oluşturma: 2026-10-06. Son karar güncellemesi: 2026-10-07. Hedef: mevcut motorlardan yararlanan, **İmece** adı, kendi özellikleri ve görsel kimliği olan bağımsız masaüstü uygulaması. Kullanıcının isteği mevcut oyunların, hareketli ikonların ve diğer görünür öğelerin de farklılaşmasıdır. Renk/logo değişikliği yeterli kabul edilmez.

Bu belge kaynak üzerinden hazırlanmış uygulanabilir backlog'dur; uygulamanın çalışan ekranlarında karşılaştırma veya paket doğrulaması yapılmış değildir. Kutular yalnızca ilgili kabul kanıtı alındıktan sonra işaretlenir. İlk kimlik ve hareket altyapısı dilimi kaynakta uygulanmış ve odaklı kontrolleri geçmiştir; bu, nihai yeniden tasarımın tamamlandığı anlamına gelmez.

## Uygulanan ilk altyapı dilimi — 2026-10-06

- `src/shared/lib/productIdentity.ts`: frontend varsayılan adı ve logo yolu merkezileştirildi. Yeni marka beklenirken MonoCode uyumluluk varsayılanı kaldı. Başlangıç hata ekranı, güncelleme kartı, sürüm notu başlıkları ve pencere başlığı varsayılanı bu altyapıyı kullanır; native ürün adı runtime üzerinden çözülür.
- `src/features/settings/model/decorativeMotion.ts`: kalıcı dekoratif hareket tercihi, canlı OS reduced-motion değişiklikleri, pencereler arası ayar bildirimi ve ortak dinleyici temizliği eklendi. Görünüm ayarındaki kontrol arama dizinine kaydedildi.
- `ProjectMascot.tsx`, `ParticleText.tsx` ve `SessionPane.tsx`: maskot hareketleri, başlık parçacıkları ve Opus/Astra karşılama sahneleri ortak tercihe bağlandı. Tercih kapanınca etkin başlık efekti temizlenir; mevcut oyunların ayrı ayarı korunur.
- Kontrol: `pnpm exec vitest run src/shared/lib/appName.test.ts src/app/model/releaseNotes.test.ts src/app/shell/BootFailure.test.ts src/app/shell/UpdateRailCard.test.ts src/app/shell/WhatsNewDialog.test.ts src/features/settings/model/decorativeMotion.test.ts src/features/settings/model/settings.test.ts src/shared/ui/ParticleText.test.ts src/features/settings/ui/SettingsView.test.ts src/features/projects/model/projectMascots.test.ts` — 10 dosyada 146 test geçti.
- Kontrol: `pnpm exec tsc --noEmit` geçti. `git diff --check` geçti; Windows satır sonu normalizasyon uyarıları hata değildi.
- Açık kapsam: yeni logo/ad, yeni ekran yerleşimleri, yeni maskot/oyun/ses varlıkları, kalan dekoratif efektler, bağımsız kurulum/veri/servis/updater kimliği ve çalışan Windows/Mac görsel kabulü. Build, kurulum, commit, push veya yayın yapılmadı. A–F kutuları bu ilk dilim nedeniyle bütünüyle tamamlandı sayılmaz.

## Kabul edilen ad — 2026-10-07

- Kullanıcı nihai ürün adını **İmece** olarak seçti. Ortak frontend marka kaynağı, görünür arayüz metinleri, HTML başlığı ve Tauri pencere başlıkları kaynakta bu ada geçirildi; bu kayıt kurulum veya cihaz kabul kanıtı değildir.
- Gelecekteki teknik kimlikler için önerilen ASCII slug `imece` olur. Paket/bundle kimliği, servis adı, veri dizini, URL protokolü ve updater kanalı bu slug'a henüz taşınmış sayılmaz; her biri A05/E görevleriyle ayrı doğrulanacak.
- Geçişte görünen ad ile paket kimliği ayrıdır: frontend İmece adını kullanır; bilinen eski native adlar yalnızca sunumda İmece/İmece Dev/İmece Fork olarak eşlenir. Tauri pencere başlıkları İmece adına geçirilir. Native `productName` paket alanı ve kurulum artifact adları, bunlara bağlı yerel güncelleme koordinatörüyle birlikte E fazında taşınacaktır; bu aşamada kurulu uygulamanın OS kaydı veya servis adı değişmiş sayılmaz.
- Ad geçişi doğrulaması: 18 ilgili test dosyasında ilk tur 372/374 geçti; iki hata (JSX metin boşluğu ve statik render hareket beklentisi) düzeltildi, etkilenen iki dosyada 94/94 geçti. Ek bağlantı ayarları kontrolü 11/11 geçti. Böylece seçilen 19 dosyadaki 385 farklı testin son sonuçları başarılıdır. Son `pnpm exec tsc --noEmit` ve dört Tauri JSON dosyasının parse kontrolü geçti; build/kurulum/yayın yapılmadı.
- 2026-10-06 ilk dilim kaydı tarihsel haliyle korunur. B01 bütünüyle tamamlanmış değildir: görünür ad kararı alındı, bağımsız teknik ürün ve dağıtım kimlikleri halen açık.

## Son karar: oyunlar kaldırıldı, köy kahvesi sahnesi — 2026-10-07

Kullanıcı oyun istemiyor. Önceki Relay/Orbit kararı geçersizdir; Pacman, Snake, Relay, Orbit motorları, oyun kontrolleri ve composer içindeki koşucu/para süslemeleri kaldırılmıştır. D03–D06'nın oyun geliştirme kapsamı iptal edilmiştir. Bunların yerine `VillageCoffeehouseScene.tsx/.css` içinde kodla çizilmiş yedi yaşlı amca hilal şeklinde, izleyiciye dönük oturur. Kıyafetler, yüzler, sandalyeler, üç çay masası ve bardaklar SVG'dir; çay içme ve sohbet hareketleri seyrek çalışır. Oyun girişi/skoru/klavye kontrolü bulunmaz.

Sahne boş sohbet ekranının normal akışındadır ve composer tıklamalarını engellemez. `Village coffeehouse` görünürlük ayarı, dekoratif hareket ve OS reduced-motion desteği vardır; gizli/ekran dışındaki sahne hareket etmez. Eski oyun ayarını kullanmaz. Önceki oyun uygulaması ve test kayıtları aşağıda tarihsel kanıt olarak korunur; güncel üründe oyun yoktur.

Kontroller: sahne/ayarlar/arama/hareket için 5 dosyada 316 test, composer/kuyruk için 2 dosyada 65 test başarılı. Çay bardağı hareketi düzeltildikten sonra sahnenin 4 testi yeniden geçti. Tarayıcı bileşen önizlemesinde yedi kişinin hilal yerleşimi, yeni çizim ve oyun kontrolü bulunmaması görüldü. TypeScript ve web üretim derlemesi geçti; native paket kurulum kabulü yapılmadı.

## Önceki uygulama dilimi — 2026-10-07

Kullanıcının son tasarım kararı **koyu Türk çay tabağı**dır. İlk petrol/bakır örgü denemesi yerine ImageGen ile antrasit tabak, bordo dilimler ve eskitilmiş altın motiflerden oluşan amblem üretildi. Geçerli marka rehberi: [imece-brand.md](imece-brand.md). Aşağıdaki eski tarihli kayıtlar geçmiş dilimleri anlatır.

- Logo açılış, proje şeridi, boş ekran ve yeni ortak karşılama bileşenine bağlandı; ICO/ICNS/platform PNG'leri aynı kaynaktan üretildi. Arayüz kömür/bordo/altın varsayılanları, yeni tipografi ve çerçeve/başlık düzenlerini kullanır; kullanıcı tema tercihleri korunur.
- 116 ortak arayüz ikonu yeni vektör çizim ailesiyle değiştirildi. Piksel karakterler yerine 8 çalışma simgesi eklendi; eski kaydedilmiş seçimler yeni karşılıklarına çözümlenir. Eski Opus/Astra karşılama kaynakları, piksel boş ekran ve kota kutlama yüzleri kaldırıldı; başlık canvas parçacıkları CSS geçişiyle değiştirildi.
- Pacman/Snake kaynak ve testleri kaldırıldı; farklı kurallarla Relay ve Orbit motorları, oyun çizimleri, skor/zorluk/yeniden başlatma ve Escape ile odak dönüşü eklendi. Ses koleksiyonu 6 yeni WebAudio cue ile değiştirildi; bildirim/sessiz mod kuralları korunur.
- Ayarlar, görevler ve gelen kutusunda yeni bölüm kompozisyonları uygulanır. Teknik kimlik `com.imece.desktop` / `.dev`, host `.imece-host`, launcher `imece-host`, varsayılan port `3775` olur. İç Cargo/CLI binary adı `monocode` ve mevcut RPC/localStorage alanları, sözleşme uyumluluğu için korunur; yeni native kimlik veri izolasyonu sağlar.
- Updater ve otomatik host indirme eski ürüne yönlenmez. İmece updater yapılandırması kapalıdır; bağımsız host indirme `IMECE_HOST_RELEASE_URL` ile açıkça tanımlanmalıdır. Eski yayın işlerinin tamamı devre dışı bırakıldı; geliştirme CI kullanılabilir. Kurulum manifesti farklı/eski ürün paketlerini reddeder. MIT ve özgün katkı atıfları korunur.

### Doğrulama ve kalan kabul

- Odaklı frontend kontrollerinde ad, görünüm, hareket, maskot, sohbet hata ekranı, ses/bildirim, proje grupları, updater ve promosyon davranışı geçti. İlk turdaki 3 eski beklenti ve görev metnindeki 2 eski ad beklentisi düzeltildi; ilgili dosyalar yeniden başarılı oldu. Ek oyun/ikon kontrolü 15, kota/proje grubu 16, bildirim akışı 12 test başarılıdır.
- Python yerel güncelleme koordinatörü: 25 başarılı. Host servis kontrolü: 7 başarılı, 2 platform nedeniyle atlanan; host TypeScript kontrolü başarılı. Rust SSH kontrolü: 21 başarılı, 1 SSH fixture gerektiren atlanan; local_host ve terminal_profiles: 6 başarılı.
- `pnpm run build` (TypeScript + Vite) ve son marka rengi/HTML değişikliklerinden sonra Vite paketleme başarılı. Değişen Rust dosyalarının dar format kontrolü başarılı. Global `cargo fmt --all --check`, değiştirilmeyen dosyalardaki mevcut biçim farkları nedeniyle başarısız; bunlar yeniden biçimlendirilmedi. Vite mevcut CSS highlight/chunk boyutu uyarıları verir.
- Tarayıcıdaki **bileşen önizlemesinde** EmptySession, amblem, tema, yeni ikonlar ve iki oyunun giriş/yön tuşu/Escape ile odak dönüşü kontrol edildi. Bu bir native uygulama kurulumu veya tüm ekranların kabulü değildir.
- Hâlâ açık: gerçek Windows/Mac yan yana kurulum, Mac'e özel derleme ve yeni ikonun Dock doğrulaması, bütün ekranların karşılaştırmalı görsel kabulü, sesin cihazda dinlenmesi, performans ölçümleri, seçilecek dil kapsamı ve bağımsız yayıncı/alan adı/imza/feed bilgileri. Bu kanıtlar gelmeden F03–F06 veya 42 görev bütünü tamamlandı sayılmaz.

## Kapsam ve kararlar

- Ürün adı **İmece**, görsel yön koyu Türk çay tabağı olarak belirlendi. Logo, ortak arayüz stili ve bağımsız teknik kimlik kaynakta uygulanır. Şirket/yayıncı adı, hedef kullanıcı ve ayrıntılı özellik kapsamı, destek/yayın adresi ve güncelleme sunucusu henüz kesinleşmedi; teknik kaynak değişikliği kurulum/yayın kanıtı değildir.
- Mevcut Windows/macOS masaüstü ve gömülü oyun mimarisi korunur; yeni mobil motor, bağımsız oyun yayını, mağaza hesabı veya GBMB markası eklenmez. Oyun üretim kuralları prototip, farklı mekanik, okunabilirlik, dışsallaştırılmış metin ve gerçek oynanış kanıtı için uygulanır; kullanıcının kendi markası önceliklidir.
- Aktif veriler, servisler, kimlik bilgileri ve kullanıcı varlıkları korunur. Toplu `monocode` metin değiştirme yapılmaz; uyumluluk, protokol ve depolama alanları ayrı ele alınır.
- Yerel uygulama geliştirme kapsamı commit/push, yayın, gerçek kurulum veya mevcut host servisini değiştirme yetkisi vermez.

## Durum ve bağımlılık sözleşmesi

Her görev için iş kaydında sorumlu, kaynak dosyalar, karar/varsayım, uygulama diff'i, kontrol komutu ve sonucu, çalışan ekran kanıtı ve açık engeller tutulur. `Kaynak uygulanmış`, `odaklı kontrol geçmiş`, `Windows çalışırken doğrulanmış`, `Mac çalışırken doğrulanmış` ve `kurulu paket doğrulanmış` ayrı durumlardır.

Faz sırası: **A karar/envanter → B temel kimlik/tasarım → C ekranlar + D oyun/varlıklar → E bağımsız dağıtım → F kabul**. C ve D, B'den sonra ayrı dosya sahipliğiyle paralel ilerleyebilir. Yayın E/F tamamlanması ve ayrı yetki gerektirir. Gereksiz keşif, başka worktree, servis silme ve toplu ayar sıfırlama yapılmaz.

## A — Ürün kararı ve kaynak envanteri

- [ ] **A01 — Ürün tanımı.** Hedef kullanıcı, ana problem, üç temel iş akışı ve tutulacak/kaldırılacak/yeni eklenecek özellikleri yaz. Kabul: her ana ekranın hangi işe hizmet ettiği açık; kapsam dışı işler kayıtlı. Bağımlılık: yok.
- [ ] **A02 — Marka girdileri.** Ad, yayıncı, kısa açıklama, logo yönü, tipografi, renk ve hareket yaklaşımını netleştir. Kabul: B/C/D'nin kullanacağı tek brief; karar bekleyen alanlar açıkça işaretli. Bağımlılık: A01.
- [ ] **A03 — Ekran/durum matrisi.** `src/app/App.tsx`, `src/app/shell/`, `src/features/` ve `index.html` üzerinden açılış, boş ekran, sohbet, görev, ayar, hata, ayrı pencere ve bildirim yüzeylerini listele. Kabul: her yüzeye tasarım sahibi ve öncesi/sonrası kanıt alanı atanmış. Bağımlılık: yok.
- [ ] **A04 — Varlık ve hareket envanteri.** `src/shared/ui/icons.tsx`, `src/styles/index.css`, `public/`, `src-tauri/icons/`, bileşen içi SVG/canvas çizimleri ve özel CSS animasyonlarını tara. Kabul: her eski varlık için değiştir/kaldır/korunması gereken üçüncü taraf kimliği kararı; yalnızca ortak ikon dosyasıyla sınırlı olmayan liste. Bağımlılık: A03.
- [ ] **A05 — Kalıcılık ve ürün kimliği matrisi.** Tauri kimliği, localStorage, native veri dizini, host servisleri, URL protokolleri, IPC/RPC sözleşmeleri ve updater kaynağını ayır. Kabul: sahiplik ve eski veriyi kullanma/aktarma kararı alan bazında kayıtlı. Bağımlılık: yok.

## B — Marka ve ortak arayüz temeli

- [ ] **B01 — Kimlik altyapısı.** Görünür ad ve ürün varlığı seçimini ortak ürün tanımında yönet; geliştirme varsayılanıyla nihai dağıtım kimliğini ayır. Kabul: seçilen kimlik açılış/pencere/hakkında ekranlarında tutarlı; üretim kimliği kararı yoksa bağımsız ürün kurulmuş iddiası yok. Bağımlılık: A02/A05.
- [ ] **B02 — Yeni tasarım sistemi.** `src/styles/index.css` ve ortak UI bileşenlerinde yüzey, tipografi, ölçü, köşe, sınır, odak, vurgu, boşluk ve kontrast kurallarını oluştur. Kabul: yeni paletin ötesinde farklı hiyerarşi ve bileşen biçimleri; açık/koyu temada okunabilirlik. Bağımlılık: A02/A04.
- [ ] **B03 — İkon ailesi.** `src/shared/ui/icons.tsx` ve bileşen içi çizimleri yeni stroke/şekil ailesine taşı. Kabul: araç, dosya, Git, durum ve menü ikonları tutarlı; gerçek provider logoları yanlış biçimde kendi markamız olarak sunulmaz. Bağımlılık: B02/A04.
- [ ] **B04 — Hareket politikası.** `src/shared/lib/animationGate.ts` ve ilgili tüketicilere dekoratif hareket, iş durumu ve reduced-motion davranışı uygula. Kabul: hareketsiz mod gerekli iş durumunu gizlemez; görünmeyen pencere/panelde döngüler durur. Bağımlılık: A04/B02.
- [ ] **B05 — Yazım ve çeviri.** Marka metinleri, session/task/host terimleri, ipuçları ve erişilebilirlik etiketlerini tutarlı kataloglara taşı. Kabul: eski ürün adı görünür varsayılan metinlerde kalmaz; gerçek lisans/atıf metinleri korunur; katalog kapsamı ayrıca ölçülür. Bağımlılık: A01/A02.

## C — Yeni ürün deneyimi ve ekranlar

- [ ] **C01 — Ana yerleşim.** `src/app/App.tsx`, `src/app/shell/ProjectRail.tsx`, `Sidebar.tsx` ve `LastSessionsSection.tsx` için yeni gezinme/çalışma kompozisyonu uygula. Kabul: aynı üç panel düzeninin yalnızca yeniden boyanması değil, A01 iş akışlarına uygun yeni bilgi mimarisi; proje ve oturum erişimi işlevsel. Bağımlılık: B02/A01.
- [ ] **C02 — İlk kullanım ve boş durumlar.** Proje/provider seçimi, bağlantı, ilk görev ve sonuçsuz arama ekranlarını yeniden kur. Kabul: yeni kullanıcı ilk işini açıklanmamış teknik terimler veya sahte çalışan butonlar olmadan başlatabilir. Bağımlılık: C01/B05.
- [ ] **C03 — Sohbet ve composer.** `src/features/sessions/ui/SessionPane.tsx`, `AgentTranscript.tsx`, `ComposerRunner.tsx` ve kompozisyon bileşenlerinde mesajlar, kod/Markdown, ekler, model seçimi, araç sonuçları, kuyruk, onay ve durdurmayı yenile. Kabul: mevcut draft/ek/odak korunur; remote refresh composer'ı yeniden kurarak içerik kaybetmez; yeni görsel hiyerarşi tüm mesaj türlerinde kullanılır. Bağımlılık: B02/B03/C01.
- [ ] **C04 — Görev ve ajan deneyimi.** `src/features/tasks/`, `LiveAgentsPreview.tsx`, `AgentTranscript.tsx` için plan, yürütme, inceleme, engel ve sonuç sunumunu yenile. Kabul: blokajın nedeni ve kullanıcının yapabileceği aksiyon görünür; bekleyen görev tamamlanmış gösterilmez. Bağımlılık: A01/B02.
- [ ] **C05 — Dosya/editör/Git/terminal.** `src/features/files/ui/`, `src/features/files/editor/`, terminal UI ve diff/Git tüketicileri için dosya ağacı, editör chrome, arama, diff, conflict ve terminal kontrollerini yeni sisteme taşı. Kabul: klavye kısayolları, split, seçim ve conflict çözümü çalışır; yalnızca syntax paleti değiştirilmiş sayılmaz. Bağımlılık: B02/B03/C01.
- [ ] **C06 — Ayarlar ve bağlantılar.** `src/features/settings/ui/` ve ilgili modellerde kategori düzenini, provider/remote host akışını, önizlemeyi ve varsayılana dönmeyi yenile. Kabul: mevcut bağlantı ve güvenli kimlik yönetimi çalışır; gelişmiş seçenekler bulunabilir; kullanıcı ayarı sessizce sıfırlanmaz. Bağımlılık: B01/B02/A05.
- [ ] **C07 — Bildirim ve hata durumları.** `src/features/notifications/`, inbox tüketicileri ve bağlantı/güncelleme hata ekranlarını ele al. Kabul: kota, erişim, bağlantı kopması, timeout ve tekrar deneme durumları yeni dil/görselle ayrılır; OS bildiriminde doğru kimlik var. Bağımlılık: B01/B05.
- [ ] **C08 — Çıktı ve destek yüzeyleri.** Dışa aktarım, paylaşım, rapor, yardım, hakkında ve destek bağlantılarını kaynakta doğrulayıp yenile. Kabul: eski ürüne yönlenen varsayılan pazarlama/destek bağlantısı yok; dışa aktarım kullanıcının sırrını veya credential'ını içermez. Bağımlılık: A03/B01/B05.

## D — Maskotlar, oyunlar ve duyusal kimlik

- [ ] **D01 — Yeni maskot ailesi.** `src/features/projects/model/projectMascots.ts` ve `ui/ProjectMascot.tsx` içindeki `invader`, `ghost`, `robot`, `cat`, `skull`, `crab`, `mushroom`, `rocket`, `dino`, `frog` siluetleri ve iki kareli hareketleri yerine yeni katalog oluştur. Kabul: on eski karakter görünmez; 16–32 px kullanımda ayırt edilebilir; boşta/çalışıyor/bekliyor/başarı/hata alternatifleri tanımlı. Bağımlılık: A02/B04.
- [ ] **D02 — Tüm maskot tüketicileri.** `ProjectRail.tsx`, `LastSessionsSection.tsx`, `AgentTranscript.tsx`, `ComposerRunner.tsx`, `LiveAgentsPreview.tsx` ve kaynak taramasında çıkan menü/not/inbox/ayar tüketicilerini güncelle. `src/app/shell/UsageProviderChip.tsx` özel kutlama çizimini ayrıca denetle. Kabul: ortak bileşen dışında eski maskot çizen yol kalmaz; eski seçim için güvenli eşleme mevcut. Bağımlılık: D01/A04.
- [ ] **D03 — İki farklı oyun brief'i.** `src/features/terminal/arcade/gridGames.ts` içindeki Pac-man ve Snake yerine özgün mekanik önerilerini belirle; amaç, ilk 30 saniye, kontrol, süre, başarı/başarısızlık, yeniden başlatma ve kapsamı yaz. Kabul: labirent/hayalet toplama veya uzayan yılan/yem mekaniklerinin yalnızca reskin'i değil; masaüstü gömülü kısa mola kullanımına uygun. Bağımlılık: A01/A02.
- [ ] **D04 — Oynanabilir prototipler.** Mevcut arcade sözleşmesi üzerinde placeholder'larla iki döngü oluştur. Kabul: gerçek input, hedef, sonuç, retry ve çıkış çalışır; ilk kullanım gözlemi yazılır; oynanabilir kanıt yokken eğlenceli/tamamlandı denmez. Bağımlılık: D03.
- [ ] **D05 — Ortak oyun render'ı.** `src/features/terminal/arcade/gridArcade.ts` ve `ui/TerminalGridBackground.tsx` içindeki Pac-man/ghost çizimleri, piksel maskotları, balonlar ve toplanabilir provider işaretlerini yeni renderer ihtiyaçlarına göre değiştir. Kabul: eski oyun çizimleri yeni registry yolundan çalışmaz; sahne, HUD, oyun sonu ve geçiş görünümü yeni aileye ait. Bağımlılık: D04/B02.
- [ ] **D06 — Oyun kontrolü ve yaşam döngüsü.** Seçim, otomatik geçiş, odak, zorluk, pause/retry/çalışmaya dön ve görünürlük davranışını tamamla. Kabul: oyun kapalıyken klavyeyi yakalamaz; composer yazımı/kısayollar bozulmaz; kapanırken listener/timer/frame temizlenir; gizlenince çalışma durur. Bağımlılık: D05/B04.
- [ ] **D07 — Oyun sanat/ses/metin üretimi.** Prototip sonrasında tutarlı karakter/nesne/efekt/HUD üret; raster gerekiyorsa ImageGen, kod/vector varlık için mevcut araçlar; varlık lisansı ve kökenini kaydet. Kabul: dinamik skor gerçek runtime verisi; metinler sabit anahtarlı katalogda; hedeflenen diller/RTL/glyph testleri kapsam matrisiyle raporlanır, çeviri mevcut değilken destek iddiası yok. Bağımlılık: D04/D05/B05.
- [ ] **D08 — Model karşılama sahneleri.** `OpusWelcome.tsx/.css`, `AstraWelcome.tsx/.css`, `SessionPane.tsx` tetikleyicileri için eski müzik/yörünge sahnelerini yenile veya yeni brief doğrultusunda kaldır. Kabul: model değişimi çalışır; eski sahne görülmez; kullanıcı yazmaya devam edebilir; skip/reduced-motion uygulanır. Bağımlılık: A02/B04/C03.
- [ ] **D09 — Parçacıklı başlık ve durum efektleri.** `src/shared/ui/ParticleText.tsx`, `src/app/shell/Sidebar.tsx`, `src/styles/index.css` ve özel CSS'lerde parlama, metin belirme, thought, plan, ağ/düğüm ve terminal efektlerini yenile. Kabul: hareket süresi/tekrar kuralları ortak; duruma bağlı bilgi statik modda okunur; eski dekoratif parçacık ailesi yok. Bağımlılık: B02/B04/A04.
- [ ] **D10 — Arka plan ailesi.** `src/features/settings/model/appearance.ts`, `newThreadBackgroundEffects` tüketicileri ve `public/` varsayılanlarında dither/ASCII/halftone/scanlines/Haze seçeneklerine yeni tasarım kararı uygula. Kabul: yeni varsayılanlar özgün; metin okunur; kullanıcı yüklediği görsel silinmez veya kendi marka varlığımız sayılmaz. Bağımlılık: B02/A04.
- [ ] **D11 — Ses ailesi.** `src/features/settings/model/sounds.ts` içindeki turnFinished, inboxUnseen, linkedActivity, updateAvailable, switch ve copy cue'larını yeni lisanslı seslerle değiştir. Kabul: ses aç/kapat ve seviye çalışır; bildirim tercihi korunur; hata/bildirim sesi kullanıcı seçimini aşmaz; önizleme ve varlık kayıtları mevcut. Bağımlılık: A02/C06/A04.
- [ ] **D12 — Açılış ve OS varlıkları.** `index.html`, `public/monocode.png`, `src-tauri/icons/` ve platform ikon kaynaklarını yenile. Kabul: açılış, görev çubuğu/Dock/tepsi ve ayrı pencere doğru logo/adı taşır; farklı çözünürlüklerde ikonlar kırpılmaz. Bağımlılık: A02/B01.

## E — Bağımsız teknik ürün ve dağıtım

- [ ] **E01 — Tauri ve paket kimlikleri.** `src-tauri/tauri.conf.json`, `tauri.fork.conf.json`, `tauri.fork.macos.conf.json`, Windows/Linux/stable config, `package.json` ve Cargo metadata alanlarını matrise göre ele al. Kaynakta dev kimliği `com.monocode.desktop.dev`, fork kimliği `com.monocode.desktop.fork` olduğundan bağımsız ürün için bunların kullanımı karara bağlanmalı. Kabul: eski uygulamanın üstüne yazmayan kimlik/kurulum yolu; dev/release ayrımı; isim/logolar installer'da da doğru. Bağımlılık: A02/A05/B01.
- [ ] **E02 — Host servis kimliği.** `host/service.ts` içindeki `com.monocode.host`, `monocode-host.service` ve Windows task tüketicilerini yeni ürüne ayır; host veri/config keşfini denetle. Kabul: yan yana iki ürünün start/status/stop/uninstall işlemleri yalnızca kendi servisini etkiler; mevcut serviste değişiklik gerçek kurulum yetkisi ve idle kanıtı olmadan yapılmaz. Bağımlılık: A05/E01.
- [ ] **E03 — Veri ve ayar aktarımı.** Görünüm/ses dahil `monocode.*` kalıcı anahtarları, native DB/data dizinleri, host konfigürasyonu ve credential saklama sınırlarını incele. Kabul: açık seçilen içe aktarma; schema sürümü ve backup/recovery; draft/ek/oturum kaybı yok; eski ürüne yazma yok; credential plaintext export/log yok. Bağımlılık: A05/E01/E02.
- [ ] **E04 — Protokol ve entegrasyon uyumu.** URL scheme, RPC/event adları, CLI env ve provider/plugin entegrasyonlarını kaynakta doğrula. Kabul: ürün etiketi değişimi eski host/protocol uyumluluğunu yanlışlıkla bozmaz; namespace değişimleri her iki uçta versiyonlu ve kontrollü; üçüncü taraf hak/kimlikleri korunur. Bağımlılık: A05/E02.
- [ ] **E05 — Updater ve imzalama.** Fork config updater endpoints, anahtarlar, manifests ve sürüm kanallarını bağımsızlaştır. Kabul: yeni ürün eski ürüne update vermez/almaz; imza kabul/ret ve rollback uygun test ortamında doğrulanır; sunucu/credential kararları yokken yayın engeli kayıtlı. Bağımlılık: E01/A02.
- [ ] **E06 — Yerel paketleme planı.** `docs/local-update.md` ve `scripts/update-local.ps1` koordinatörünü kullan; önce `-Plan`, paket yeniden kullanımı gerekiyorsa `-InstallOnly`; pnpm packageManager sürümüne uy. Kabul: ad-hoc SSH/build/service swap yok; `-Status` ve kayıtlı artifact/log incelemesi; scheduled/waiting installed sayılmaz. Gerçek build/install bu backlog'un yazılmasıyla yapılmış değildir. Bağımlılık: E01–E05/F01; ayrıca gerçek build/install isteği.
- [ ] **E07 — Lisans ve dokümantasyon.** Repo lisansı, üçüncü taraf bağımlılık/varlık bildirimleri, README, yardım ve sürüm notlarını incele. Kabul: gerekli telif/izin metni korunur; yeni görsel/ses hak kayıtları mevcut; pazarlama metni çalışmayan özellik veya doğrulanmamış dil/platform vaat etmez. Bağımlılık: A04/D07/D11.

## F — Kanıt, temizlik ve kabul

- [ ] **F01 — Odaklı teknik doğrulama.** Paralel kod yazımları tamamlandıktan sonra tek final validation turunda değişen davranışların ilgili testlerini ve typecheck/build gereksinimini çalıştır. `projectMascots.test.ts`, `gridGames.test.ts`, `animationGate.test.ts`, görünüm/ses testleri değişen sözleşmelere göre seçilir. Kabul: komut/sonuç kayıtlı; tekrarlı alias testleri yok; başarısızlıklar çözülmüş veya açık engel olarak gösterilmiş. Bağımlılık: uygulanan B/C/D/E kaynak işleri.
- [ ] **F02 — Eski varlık taraması.** Kullanılmayan eski maskot/game/welcome/ikon/ses kaynak ve importlarını temizle; eski marka araması sonuçlarını görünür metin, kalıcılık/uyumluluk ve yasal atıf olarak değerlendir. Kabul: kullanıcı yüzeyine bağlı eski öğe yok; uyumluluk/lisans için tutulan alanların gerekçesi kayıtlı. Bağımlılık: C/D/E.
- [ ] **F03 — Görsel kabul matrisi.** Windows ve Mac üzerinde açılış, ana sayfa, sohbet, araç sonucu, görev, ayar, hata, oyun, bildirim ve ayrı pencereyi karşılaştırmalı kaydet. Kabul: logo gizliyken de yerleşim/komponent/varlık/hareket farklılığı gösterilebilir; kullanıcının istediği yeni görünüm kararına göre değerlendirilir; kayıtta build/platform belirtilir. Bağımlılık: B/C/D; çalışan platform erişimi.
- [ ] **F04 — Erişilebilirlik ve lokalizasyon.** Klavye/odak, ölçekleme, yüksek kontrast, ekran okuyucu etiketleri, reduced-motion, sessiz mod, metin genişlemesi ve seçilen dil kapsamını doğrula. Kabul: temel işlemler dekoratif hareket veya oyun kontrolüne bağımlı değil; doğrulanmamış diller tamamlandı sayılmaz. Bağımlılık: C/D/B05.
- [ ] **F05 — Performans ve kesinti.** Oyun/partikül arka plandayken CPU/GPU, memory ve sohbet akıcılığını ölç; pencere hide/resume, bağlantı kopması ve yeniden açılmayı dene. Kabul: bütçe önce tanımlı; yeni varlıklar ölçülen regresyon yaratmaz; draft/state korunur; test ortamı ve ölçüm kanıtı mevcut. Bağımlılık: B04/C03/D06/D09.
- [ ] **F06 — Yan yana kurulum ve updater kabulü.** İki ürünün bağımsız config/data/service/installer/update davranışını hedef cihazlarda doğrula. Kabul: mevcut ürünün veri/servisi korunmuş; kurulu app ve host sürümleri doğrudan okunmuş; build artifact, scheduled install ve gerçek kurulmuş paket ayrı raporlanmış. Bağımlılık: E01–E06; açık kurulum yetkisi ve hedef erişimi.

## İlk uygulanabilir dilim

1. A03–A05 envanter ve B01/B04 gibi geri alınabilir altyapı işleriyle başla; İmece görünür adını kullan, stil/yayıncı/teknik kimlik kararları verilmeden bunları tamamlanmış marka veya dağıtım olarak sunma.
2. A01/A02 kararlarıyla ana ekran, sohbet ve ayarlar için yeni kompozisyonu üret; B02/B03/C01 ilk dikey dilimi oluştur.
3. D01/D08/D09 üzerinden ilk görünür varlık dönüşümünü uygula; D03/D04'te farklı oyunları oynanabilir hale getir.
4. C'nin kalan ekranları ve D'nin sanat/ses/oyun polish'i tamamlanınca F01/F02; ardından erişilebilir çalışan platformlarda F03–F05.
5. E/F06 bağımsız kurulum ve updater doğrulamasını ayrı yetki/erişim çerçevesinde tamamla. Bu adımlar gelmeden yeni ürün hazır, kurulmuş veya yayınlanmış sayılmaz.
