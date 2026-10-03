# MonoCode 0.8.42 yerel ve Mac güncellemesi

3 Ekim 2026: mevcut çalışma ağacındaki performans düzeltmelerini içeren sürüm kuruldu. Commit, push veya herkese açık release oluşturulmadı. Daha önce staged olan sürüm dosyalarının index içeriği korunarak çalışma ağacı sürümü 0.8.42 yapıldı.

| Hedef | Önce | Sonra | Doğrulama |
| --- | --- | --- | --- |
| Windows uygulama | 0.8.33 | 0.8.42 | Kurulu EXE FileVersion/ProductVersion ve uninstall kaydı; çalışan PID 21340 |
| Windows host | 0.8.40 | 0.8.42 | Yeni runtime altında çalışan PID 84848; lifecycle ve kimlik doğrulamalı RPC |
| Mac uygulama | 0.8.40 | 0.8.42 | `/Applications/MonoCode.app` bundle sürümü, `codesign --verify --deep --strict`, çalışan PID 62748 |
| Mac host | 0.8.40 | 0.8.42 | Yeni runtime altında çalışan PID 59973; launchd servisi, lifecycle ve kimlik doğrulamalı RPC |

PID'ler doğrulama anının kanıtıdır; kalıcı yapılandırma değildir. Mac'te ikinci doğrulama açılışı kısa süreli ikinci bir uygulama süreci oluşturdu; son kontrolde yalnızca yukarıdaki uygulama süreci vardı.

## Paketler ve servisler

- Windows kurulum: `target/release/bundle/nsis/MonoCode_0.8.42_x64-setup.exe`; 11.941.820 byte; SHA-256 `4e2ee5c6a84505695a9494f7a21ce3292f6d1b1e165caeee271cc62eecc62e7e`. Updater imzası aynı dizindeki `.sig` dosyasıdır.
- Windows uygulama kurulu yolu: `%LOCALAPPDATA%\MonoCode\monocode.exe`. Sessiz NSIS kurulumundan sonra sürüm ve süreç tekrar kontrol edildi. Kurulum için eski uygulama kapatıldı; eski EXE geri dönüş kopyası `%LOCALAPPDATA%\MonoCodeUpdate\rollback-before-0.8.42\monocode-0.8.33.exe` altında.
- Windows host runtime: `%USERPROFILE%\.monocode-host\runtime\0.8.42-win32-x64-manual`. Mevcut `service.ps1`, launcher ve `runtime-path` yeni runtime'a yönlendirildi; eski host lifecycle komutuyla durduruldu ve mevcut scheduled task yeniden başlatıldı. Task'ı disable etme denemesi erişim reddi aldı; task izinlerini değiştirmeden, mevcut servis dosyası ve task'ın çalıştırma yetkisi kullanıldı.
- Kapanmayı bekleyen eski `MonoCode Update 0.8.40` görevi durdurulup devre dışı bırakıldı; yeni sürümü sonradan geri indirmemesi için disabled bırakıldı.
- Mac build, uzak mevcut checkout'a kaynak yazmadan `/Users/bahadryalcn/projects/monocode-build-0.8.42` içinde yapıldı. Aktarılan kaynak arşivinin SHA-256'sı iki tarafta aynı: `ac2968b3fc97d4e43bd58a73e95b19cfaf7e6414f7089b09f1e7ff2b33bb3216`. Lockfile bağımlılıkları eşleştiğinden mevcut `node_modules` ve Cargo target cache'i kullanıldı.
- Mac uygulama, Apple Silicon hedefi için app bundle olarak derlendi ve kuruldu. Önceki bundle `/Applications/MonoCode-0.8.40-before-0.8.42.app` altında tutuluyor. Yerel ad-hoc imza doğrulandı; Apple notarization yapılmadı.
- Mac host runtime: `~/.monocode-host/runtime/0.8.42-darwin-arm64-manual`. Mevcut doğrulanmış Node 24.21.0 runtime'ı ve yeni host bundle'ı kullanıldı. LaunchAgent yeni runtime'a yönlendirildi, bootout/bootstrap ile yeniden başlatıldı.
- İki kurulu hostun `host.mjs` SHA-256'sı yerel build ile aynı: `393f0c07d82177563e1b560466626c7abfff0e008206f7069ba16a552099ee91`.

## Veri ve bağlantı doğrulaması

Her makinede uygulama ve host veritabanlarının SQLite online backup'ı alındı; yedeklerin ve güncelleme sonrası dört canlı veritabanının `PRAGMA quick_check` sonucu `ok`. Kimlik bilgileri, payload veya sohbet metni doğrulama kayıtlarına yazılmadı.

| Veri | Önce ve son kontrolde |
| --- | --- |
| Windows uygulama | 181 oturum |
| Windows host | 13 proje, 3 cihaz, 77 sync kaydı, 0 host oturumu |
| Mac uygulama | 8 oturum |
| Mac host | 11 proje, 5 cihaz, 77 sync kaydı, 6 host oturumu |

- Host yedekleri her makinenin `.monocode-host/backups/update-0.8.42` dizininde. Servis/launcher ayarları da bu dizinde saklandı.
- Uygulama DB yedekleri ilgili `com.monocode.desktop.fork/backups/update-0.8.42/monocode.db` dizininde.
- Windows'ta kayıtlı mevcut iki cihaz credential'ıyla `environment.describe`, `projects.list`, `sync.pull` sorguları başarılı. Environment kimlikleri değişmedi; iki host da yeni sayfalı pull cevabı döndürdü. Uzak doğrulama için açılan geçici SSH forward işlem sonunda kapatıldı.
- Makine değişmeden yerel UI veya gerçek çoklu pencere/minimize trafik ölçümü yapılmış sayılmaz. Paket/build ve RPC başarıları CPU/ağ kazanımı kanıtı değildir.

## Güncellemede görülen açık hata

Mac crash raporu `~/Library/Logs/DiagnosticReports/monocode-2026-10-03-205523.ips`, sürüm 0.8.42 için SIGABRT kaydediyor. Faulting stack, Rust foreign-exception cleanup ve Tokio blocking task içinde `monocode_lib::open_new_window` içeriyor. Kaynakta bu komut `spawn_blocking` içinde native pencere açıyor. Bu kayıt yeni pencere açma akışının ayrıca incelenmesini gerektiriyor; kesin native exception nedeni veya her açılışta tekrarlandığı kanıtlanmadı. Son kontrollerde uygulama PID 62748 ile çalışmaya devam etti. Hata [performans TODO'suna](performance-todo-2026-10-03.md) P26 olarak eklendi ve düzeltilmiş sayılmadı.
