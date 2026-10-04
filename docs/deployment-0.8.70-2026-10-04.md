# MonoCode 0.8.70 yerel kurulum

Windows PC ve MacBook için uygulama ve host paketleri aynı kaynak snapshot'ından hazırlandı. Sürüm dosyaları 0.8.70 olarak güncellendi. Commit, push ve herkese açık release yapılmadı.

Kaynak arşivi: `build/deployment-0.8.70/source-0.8.70-final.tar.gz`; SHA-256 `fe0a21cc2d521c4171a0147a88b2972c583cac502643923b2c949419d8cf7bc8`. Mac'te checksum eşleşti. Derleme sırasında başka oturumların beceri yönetimi dosyalarını değiştirmeye devam ettiği görüldüğü için Windows son derlemesi de bu sabit snapshot'ın `frozen-source` kopyasında yapıldı. Snapshot sonrasındaki değişiklikler bu pakete dahil değildir; çalışma ağacında korundu.

## Kurulum durumu

| Bileşen | Durum / doğrulama |
| --- | --- |
| Windows host | 0.8.70 runtime'ı çalışıyor; kimlik doğrulamalı environment, settings, tasks, goals, stewards RPC kontrolleri başarılı; SQLite quick_check ok |
| Mac uygulama | Son snapshot'tan 0.8.70 kuruldu ve açıldı; bundle sürümü ve codesign doğrulandı |
| Windows uygulama | Görüşmedeki aktif tur tamamlanınca gizli kurulum yardımcısı güncelleyip yeniden açacak |
| Mac host | Çalışan oturumlar nedeniyle bekliyor; gizli yardımcı oturumlar bitince LaunchAgent'ı yeni runtime'a geçirecek (son kontrolde iki oturum) |

## Paketler, loglar ve geri dönüş

- Windows installer ve updater imzası: `target/release/bundle/nsis/MonoCode_0.8.70_x64-setup.exe` ve `.sig`.
- Windows host paketi SHA-256: `46ddcb8b7671ec0b69a599fef010ca4e92d21ded366660e35858e18eaf5df90a`.
- Mac host paketi SHA-256: `57e4854e7789adb2c471bc598a6ac3612f4714f92342f808b8fe6ed2e33de17b`.
- Host runtime'ları: Windows `~/.monocode-host/runtime/0.8.70-win32-x64-manual`, Mac `~/.monocode-host/runtime/0.8.70-darwin-arm64-manual`; Node 24.21.0.
- İki runtime'ın host.mjs SHA-256 özeti eşleşiyor: `df943e6bc9f19e1f36262d46631b568444c1f37b151221d52602056ddbe12f59`.
- Windows logları: `build/deployment-0.8.70/`, installer logu `%LOCALAPPDATA%/MonoCodeUpdate/install-0.8.70.log`.
- Mac logları: `~/projects/monocode-build-0.8.70/`; kurulum geçişleri `install.log`, host yardımcısı hataları `host-switch.log`.
- Her iki makinede host ve masaüstü SQLite online yedekleri: `~/.monocode-host/backups/update-0.8.70/`; dört yedeğin quick_check sonucu ok.
- Mac eski uygulaması: `/Applications/MonoCode-before-0.8.70.app`. Windows eski executable: `%LOCALAPPDATA%/MonoCodeUpdate/rollback-before-0.8.70/monocode.exe`.
- Eski host runtime'ları korundu. Windows servis scripti/launcher/runtime-path ve Mac plist/runtime-path yedekleri update-0.8.70 klasöründe.

## Kontroller

- Windows ve Mac uygulama derlemelerinde TypeScript ve Vite başarılı. Host paketlemede host TypeScript kontrolü başarılı.
- Windows sabit kopyasında TypeScript geçti; node_modules junction ile Vite dönüşümü ilerlemediği için o süreç durduruldu. Platform tanımı içermeyen Vite yapılandırmasının Mac'te aynı snapshot'tan başarılı ürettiği `dist` arşivi Windows paketine aktarıldı. Son Windows native derlemesinde yalnızca tekrar web derlemesi atlandı; Rust/NSIS/imza aşamaları çalıştırıldı.
- Host tasks, goals, stewards, automations, server ve engine: 172 test geçti.
- Son snapshot beceri yönetimi: 17 host, 37 arayüz testi geçti.
- İlgili arayüz kontrollerinde Mac Node 25'in webstorage ayarı happy-dom localStorage ile çakıştı. İki dosya `NODE_OPTIONS=--no-webstorage` ile tekrar kontrol edildi: 53/54 geçti.
- RemoteSession `runs a !command on the host instead of sending it as a message, even mid-turn` testi tek başına geçti; dosyanın tamamında Stop düğmesini beklerken başarısız oldu. Bu test sırası sorunu çözülmüş sayılmadı.
- Mac uygulaması ad-hoc imzalı; Apple notarization yapılmadı. Kamuya açık updater/release kabulü bu yerel kurulum kapsamında doğrulanmadı.
