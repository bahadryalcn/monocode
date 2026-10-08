# T3 geliştirmeleri: kurulum sonrası doğrulama

Tarih: 2026-10-08. Kullanıcı yerel Windows/Mac kurulumunu, testleri ve sonrasında eksik araçların kurulmasını yetkilendirdi. Commit, push veya yayın yapılmadı.

## Son durum: araç kurulumu ve gerçek testler

- Windows ve Mac'e `playwright@1.64.0` ve Chromium headless shell kuruldu. Paketler sabit uygulama payload'ı dışında, host runtime'larının ortak üst dizininde bulunur.
- Her iki kurulu host üzerinden gerçek Chromium açıldı; yerel test sayfasına tıklama gönderildi ve sayfanın HTTP callback'i doğrulandı. Önce/sonra JPEG görüntüleri kaydedildi. Bunlar MonoCode masaüstü UI görüntüleri değil, host'un paylaşılan tarayıcısından alınan görüntülerdir.
- Windows'ta bir tekrarda navigasyonun 15 saniyelik sınırı doldu. Testin kendi localhost sayfası doğrulanarak kapatıldı; yeniden açılış, gerçek tıklama ve görüntü alma başarılı oldu. Süresi dolmuş kontrol yetkisiyle cleanup denenmemesi için test yardımcısı düzeltildi.
- İki makinede `expo-device-hub@0.12.0` ve cihaz kontrol aracı kuruldu. Kontrol aracının ilk sürümündeki XCTest zaman aşımı sonrası `agent-device@0.21.23` sürümüne geçildi; eski cache korundu. Windows'un paketli Node runtime'ı için ayrı runtime toolchain dizinine `npm@12.2.0` eklendi.
- Mac'te Xcode ve simülatörler zaten mevcuttu. İlk `simctl` hatası aktif CommandLineTools dizininden kaynaklanıyordu. Host'un cihaz alt süreçleri mevcut Xcode, Android SDK ve Homebrew JDK17 yollarını kullanır; sistem genelindeki Xcode seçimi değiştirilmedi.
- Son Mac testinde 18 cihaz keşfedildi. Gerçek iOS 27 simülatörü açıldı, PNG ekran görüntüsü alındı ve host üzerinden `home` kontrol komutu başarıyla uygulandı. PR ve oturum listesi sorguları da geçti. Test sırasında açılan özel hub/agent oturumu kapatıldı, geçici erişim kimliği kaldırıldı; simülatör kullanıma açık bırakıldı.
- Son Windows testinde cihaz araçlarının güncel kurulumu doğrulandı; gerçek projedeki 52 masaüstü oturumunun listelenmesi, PR takip listesi ve mevcut bir oturumun artifact listesi sorguları geçti. Mevcut sohbetlere mesaj gönderilmedi veya history archive yazılmadı.
- Canlı testte bulunan iki entegrasyon hatası düzeltildi: serve-sim screenshot endpoint'inin POST istemesi ve agent kontrolünden önce cihazla eşleşmiş oturumun açılması/yeniden kullanılması. Oturum kimliği/platform/cihaz eşleşmesi doğrulanır; host dururken kendi kontrol oturumlarını kapatır.
- Son host paketi iki makinede kurulu: `a21c4237a9529d76-local`. Mac masaüstü uygulaması `5585acc94b120b38-local` (0.9.13) paketindedir. Windows masaüstü için `af43cd37c684bfb2-local` kurulum işi hâlâ boşta kalmayı bekliyor; son kayıt 6 aktif oturum. Kurulum yardımcısının çalıştığı doğrulandı.
- Kaynak ağacında eşzamanlı OpenCode/Pi düzenlemeleri genel typecheck'i geçici olarak bozdu. Son doğrulanmış snapshot üzerine yalnız cihaz ve koordinatör dosyaları alındı; paketlenen snapshot'ın host typecheck'i, host derlemesi ve 7 cihaz testi geçti. Koordinatörün 28 testi de geçti. Yarım kalan başka oturum değişiklikleri bu host paketine alınmadı.

Kalan sınırlar: Windows'un yerel Android cihaz hub'ı `avdmanager` çağrısında hata veriyor; mevcut AVD doğrudan `avdmanager.bat` ile listelenebiliyor. Bu harici hub'ın Windows komut uyumsuzluğudur; Windows yerel emülatör kabulü geçti denmiyor. Web control origin ve generic ACP hesabı hâlâ yapılandırılmadı. Gerçek PR/CI ve artifact oturum testi, ayrıca masaüstü uygulaması görsel kabulü tamamlanmadı.

Görüntüler:

- [Windows tarayıcı: önce](evidence/t3-2026-10-08/browser-windows-before.jpg)
- [Windows tarayıcı: tıklama sonrası](evidence/t3-2026-10-08/browser-windows-after.jpg)
- [Mac tarayıcı: tıklama sonrası](evidence/t3-2026-10-08/browser-mac-after.jpg)
- [Gerçek iOS simülatörü](evidence/t3-2026-10-08/ios-simulator.png)

Aşağıdaki ilk test bulguları tarihsel kayıttır; araç eksiklikleri yukarıdaki güncellemede giderildi.

Paket: `af43cd37c684bfb2-local`, sürüm `0.9.13`. Her iki makine aynı sabit kaynak paketini kullanıyor.

## Bu turda geçen kontroller

- Yeni host özellikleri: 12 dosyada 31 test geçti; Windows symlink izni gerektiren 1 test atlandı.
- Uygulama: 7 dosyada 35 test geçti. HTML artifact, agent app, handoff bütçesi, generic ACP yapılandırması ve PR takip modelleri kapsandı.
- Uygulama ve host TypeScript typecheck: ikisi de başarılı.
- Kurulu Windows ve Mac hostları: lifecycle sağlık kontrolü başarılı.
- Her iki canlı host: kimliksiz RPC 401, browser Origin ile native RPC 403 döndü.
- Her iki canlı host: yedi yeni özelliğin capability bildirimi, kaynak ölçümü, generic ACP listeleme, browser durum sorgusu ve proje listeleme başarılı.
- Test için standart host CLI ile geçici cihaz kimliği oluşturuldu; kontroller sonrası kaldırıldı. Kaldırılan kimliğin 401 alması doğrulandı. Kimlik bilgileri rapora/log çıktısına yazılmadı.
- Mac uygulaması kurulu ve çalışıyor; sürüm 0.9.13, kurulu binary SHA256 paket manifestiyle eşleşiyor.

Test yardımcı dosyası: `.scratch/t3-installed-smoke-20261008.py`. Kurulu host runtime'ını kullanır. `--devices`, araçları kurar ve gerçek cihaz testini yapar; gerekirse mevcut MonoCode çalışma klasörünü host'a proje olarak kaydeder. Sağlayıcı hesabı veya ajan sohbeti oluşturmaz. `--devices --setup-only` yalnız araç hazırlığını tamamlar. Proje bulunan ortamda cihaz durumu, PR takip ve mevcut oturum artifact listelerini de kontrol eder.

## Tamamlanamayan gerçek ortam kontrolleri

| Kontrol | Gözlenen engel |
| --- | --- |
| Windows yeni masaüstü uygulaması | Önceki kurulum yardımcısı `installing` durumunda kalmış ve PID sona ermişti. `update-local.ps1 -Platforms windows -InstallOnly` mevcut paketi yeniden kullanarak yardımcıyı başlattı. Son durum `waiting`, 2 aktif oturum. Kurulu binary yeni manifestle eşleşmiyor; yeni uygulamanın kurulumu henüz tamamlanmadı. |
| Masaüstü görsel doğrulaması | Computer-use native pipe bağlantısı bulunamadı: `Sistem belirtilen dosyayı bulamıyor. (os error 2)`. Ekran görüntüsü alınamadı; görsel kabul iddiası yok. |
| Gerçek Chromium açılışı ve frame | İki kurulu hostta da gerçek `browser.open` denendi; Playwright runtime bağımlılığı eksik hatası döndü. Geçici browser kontrolü kapatıldı. İndirme/kurulum yapılmadı. |
| iOS simülatörü | Mac üzerinde `xcrun simctl list devices available --json`, `unable to find utility simctl` hatası verdi. Xcode/simulator toolchain hazır değil. |
| Generic ACP gerçek sağlayıcı | Her iki hostta yapılandırılmış generic ACP hesabı sayısı 0. Gerçek ajan oturumu denenmedi. |
| Web/mobile kontrol | Her iki hostta `webControl` yapılandırılmamış. HTTPS/proxy veya host ortam ayarları değiştirilmedi. |
| Gerçek PR/CI, artifact ve oturum işlemleri | Her iki hostun kayıtlı proje listesi boş. Gerçek proje/oturum üzerinde bu iş akışları denenmedi; ilgili kaynak ve entegrasyon testleri geçti. |

Uygulama testindeki happy-dom iframe yükleme uyarısı test ortamının yüklemeyi kapatmasından kaynaklanır; ilgili iki test geçti. Bu testler gerçek WebView render doğrulaması değildir.

Önceki doğrulama turunda mevcut `host/tasks` testlerinin iki başarısızlığı değişikliksiz HEAD üzerinde de yeniden üretilmişti; bu turda tekrar çalıştırılmadı. Ayrıntılar `t3-adoption-research-2026-10-08.md` dosyasında.

Aktif oturumlar zorla kapatılmadı; SDK, ek sağlayıcı veya runtime bağımlılıkları kurulmadı. Windows kurulumu, koordinatörün boşta kalma kontrolü sağlandığında devam edecek.

Üstteki son durum, ilk test turundaki bu araç-kurulum sınırını geçersiz kılar: kullanıcı daha sonra araçları kurmaya açıkça izin verdi. Paket sürümleri [Playwright kurulum dokümanı](https://playwright.dev/docs/browsers) ve [agent-device 0.21.23 sürüm kaydı](https://github.com/callstack/agent-device/releases/tag/v0.21.23) ile birlikte sabitlendi; gerçek kabul iddiaları bu makinedeki RPC/test sonuçlarına dayanır.
