# MonoCode 0.8.45 yeniden build ve kurulum

4 Ekim 2026: güncel 0.8.43 çalışma ağacı sürümü 0.8.45 yapılarak yeniden derlendi. Bu çalışmada yalnızca beş sürüm dosyası değiştirildi; ek ürün düzeltmesi, commit, push veya herkese açık release yapılmadı.

| Bileşen | Önce | Doğrulanan son sürüm | Kontrol |
| --- | --- | --- | --- |
| Windows uygulama | 0.8.42 | 0.8.45 | Kurulu EXE FileVersion/ProductVersion; çalışan PID 63804 |
| Windows host | 0.8.43 | 0.8.45 | Sürümlü runtime, lifecycle ve kimlik doğrulamalı RPC; PID 13708 |
| Mac uygulama | 0.8.43 | 0.8.45 | Kurulu bundle sürümü, codesign doğrulaması; çalışan PID 91208 |
| Mac host | 0.8.43 | 0.8.45 | LaunchAgent yeni runtime'ı çalıştırıyor; lifecycle ve kimlik doğrulamalı RPC; PID 91186 |

PID'ler doğrulama anına aittir.

## Windows kurulum dosyası

[`MonoCode_0.8.45_x64-setup.exe`](../target/release/bundle/nsis/MonoCode_0.8.45_x64-setup.exe)

- Mutlak yol: `G:\Projects\my_projects\monocode\target\release\bundle\nsis\MonoCode_0.8.45_x64-setup.exe`.
- Boyut: 11.941.546 byte.
- SHA-256: `e766aa341ce57c28348db697331092731a13101e824117f806e851f50e62422f`.
- Updater imzası aynı dizinde `MonoCode_0.8.45_x64-setup.exe.sig`.
- Bu PC'ye sessiz NSIS kurulumuyla kuruldu; uygulama kapatılıp yeniden açıldı. Önceki EXE `%LOCALAPPDATA%\MonoCodeUpdate\rollback-before-0.8.45` altında korundu.

## Build ve host paketleri

- Windows: `npm run build:windows`, iki Cargo worker ile başarılı. Frontend type-check/Vite build ve native release/NSIS paketlemesi tamamlandı. Mevcut CSS ve büyük bundle uyarıları devam ediyor.
- Windows host: `build/host-packages/monocode-host-win32-x64.zip`; paketli executable `--version` kontrolü 0.8.45 döndürdü.
- Mac ARM host: `build/host-packages/monocode-host-darwin-arm64.tar.gz`; checksum dosyası aynı dizinde. İki host Node 24.21.0 kullanıyor.
- Mac uygulama: `/Users/bahadryalcn/projects/monocode-build-0.8.45` kaynak snapshot'ından Apple Silicon app bundle build'i başarılı. Lockfile bağımlılıkları eşleştiği için mevcut bağımlılık ve Cargo cache'leri kullanıldı. Kaynak arşivi iki tarafta SHA-256 `af7f149b4dec66abfbdecc6fb4f2b2ab79efc0f89e74ef17aa38317d5f0addba` ile doğrulandı.
- Mac'te `/Applications/MonoCode.app` kuruldu; önceki bundle `/Applications/MonoCode-0.8.43-before-0.8.45.app` altında. Ad-hoc codesign doğrulaması başarılı; Apple notarization yapılmadı.
- Host runtime yolları Windows'ta `.monocode-host\runtime\0.8.45-win32-x64-manual`, Mac'te `.monocode-host/runtime/0.8.45-darwin-arm64-manual`. Launcher, servis dosyası ve runtime-path bu sürüme yönlendirildi.
- İki kurulu host bundle'ı yerel build ile aynı SHA-256'ya sahip: `148bbb0824305adbdf00a6a66758aa9d1dcc8ac6a58c6f13c0b4d40a6a0f9dd9`.

## Veri ve erişim doğrulaması

- Dört veritabanının SQLite online backup'ı, kendi veri dizinlerindeki `backups/update-0.8.45` altına alındı. Host servis ayarları da yedeklendi.
- Yedeklerde ve kurulum sonrası dört canlı veritabanında `PRAGMA quick_check` başarılı.
- Windows uygulamada 181, Mac uygulamada 8 oturum; Windows hostta 13 proje/3 cihaz/77 sync kaydı, Mac hostta 11 proje/5 cihaz/6 oturum/77 sync kaydı korundu.
- Mevcut Windows cihaz credential'larıyla iki hostta `environment.describe`, `projects.list`, sayfalı `sync.pull` başarılı; environment kimlikleri değişmedi. Doğrulama için açılan geçici SSH forward kapatıldı.
- Mac bağlantısı başlangıçta LAN ve Tailscale üzerinden zaman aşımı verdi; LAN bağlantısı geri geldikten sonra build/kurulum ve doğrulama tamamlandı.
- Build logları, artifact hash'leri ve RPC sonuçları yerel `build/deployment-0.8.45` dizininde. Token veya sohbet içeriği bu kayıtlara yazılmadı.
- Bu sürüm yükseltmesi yeni hata düzeltmesi değildir. Önceki P26 Mac yeni pencere çökmesi için düzeltme veya tekrar testi yapılmadı; CPU/ağ kazanımı da ölçülmedi.
