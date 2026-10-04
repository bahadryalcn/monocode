# MonoCode 0.8.48 build ve kurulum

4 Ekim 2026: `86a563ae` commit'i ve üzerindeki commit'lenmemiş altı dosyalık değişiklikle sürüm 0.8.48 yapılarak derlendi ve kuruldu ([0.8.47 kurulumu](deployment-0.8.47-2026-10-04.md) ile aynı yöntem). Bu çalışmada yalnızca sürüm dosyaları değiştirildi; commit, push veya herkese açık release yapılmadı.

| Bileşen | Önce | Sonra | Kontrol |
| --- | --- | --- | --- |
| Windows host | 0.8.47 | 0.8.48 | `status`: çalışıyor, port 3774; süreç yeni runtime'dan; DB `quick_check` ok |
| Mac host | 0.8.47 | 0.8.48 | LaunchAgent yeni runtime'ı çalıştırıyor; `status` ok; DB `quick_check` ok |
| Mac uygulama | 0.8.47 | 0.8.48 | Bundle sürümü, ad-hoc codesign doğrulaması, süreç çalışıyor, yeni çökme kaydı yok |
| Windows uygulama | 0.8.46 | 0.8.48 (kurulum görevi) | `MonoCode Update 0.8.48` görevi; sonuç `%LOCALAPPDATA%\MonoCodeUpdate\install-0.8.48.log` içinde. Bu belge yazılırken kurulum henüz çalışmamıştı. |

Windows uygulaması 0.8.47'ye hiç geçmedi: o kurulum görevi MonoCode'un kapanmasını bekliyordu ve uygulama kapatılmadı. Görev silindi; uygulama 0.8.46'dan doğrudan 0.8.48'e geçecek.

## Windows uygulama kurulum görevi

`%LOCALAPPDATA%\MonoCodeUpdate\install-0.8.48.ps1`: 60 saniye bekler, uygulama veritabanındaki `in_flight_sessions` sayısına bakar. Tur ortasında oturum yoksa MonoCode'u kapatır (15 saniye içinde kapanmazsa zorla), sessiz kurulumu yapar ve uygulamayı yeniden açar. Tur ortasında oturum varsa uygulamayı kapatmaz; kullanıcı kapatana kadar bekler, sonra kurar.

## Artifact'lar

- Windows kurulum dosyası: `target\release\bundle\nsis\MonoCode_0.8.48_x64-setup.exe`, 12.033.386 byte, SHA-256 `488D2CF60C9F5E7512C8A3315E96C7E65FD9F8A697B2CC968CB986DEAF10C625`; updater imzası aynı dizinde `.sig`.
- Host bundle (`build\host\monocode-host.mjs`): SHA-256 `719272B0F92477199251E34458CE7D7174666695C529D017ABDAAF2983F78742`.
- Host paketleri: `build\host-packages\monocode-host-win32-x64.zip`, `monocode-host-darwin-arm64.tar.gz` (SHA-256 `a0a65272c22036641cdda2d26d0c8abe272f0cc3217f53db0716729eaea132f7`, Mac'te doğrulandı). Node 24.21.0.
- Mac kaynak snapshot'ı: `/Users/bahadryalcn/projects/monocode-build-0.8.48` (arşiv SHA-256 `8a257e5d724e35c80a1e6da76b04b0d0c8375f95c356622b4284cd96eeb14b48`, iki tarafta eşleşti). Lockfile 0.8.47 ile aynı olduğu için o build'in `node_modules` klasörü kullanıldı.
- Build logları: `build\deployment-0.8.48\`.

## Kurulum ve geri dönüş

- Host runtime yolları: Windows `.monocode-host\runtime\0.8.48-win32-x64-manual`, Mac `.monocode-host/runtime/0.8.48-darwin-arm64-manual`. Öncekiler `*.before-0.8.48` olarak duruyor.
- Mac'te önceki bundle: `/Applications/MonoCode-before-0.8.48.app`.
- Windows'ta önceki EXE: `%LOCALAPPDATA%\MonoCodeUpdate\rollback-before-0.8.48\monocode-0.8.46.exe`.
- Dört veritabanının SQLite online backup'ı kendi veri dizinlerinde `backups/update-0.8.48` altında; yedeklerde `quick_check` ok.

## Veri doğrulaması

- Kurulum öncesi: Windows uygulama 185 oturum; Windows host 14 proje / 6 cihaz / 2 oturum; Mac uygulama 9 oturum; Mac host 11 proje / 5 cihaz / 7 oturum. İki hostta da çalışan oturum yoktu; Mac uygulamasında tur ortasında oturum yoktu.
- Kurulum sonrası: iki hostta `quick_check` ok ve aynı sayılar (sync kaydı 79); Mac uygulama DB'sinde `quick_check` ok, 9 oturum.
- Kimlik doğrulamalı RPC kontrolü yapılmadı; yalnızca host `status` ve DB kontrolleri yapıldı.

## Yapılmayanlar

- Bu build için test takımları yeniden çalıştırılmadı; yalnızca `tsc` (uygulama ve host) temizdi. Son tam test koşusu 0.8.47 öncesindeki ağaç içindi.
- Yeni sürümde elle kullanım denemesi ve performans ölçümü yapılmadı.
- Windows uygulama kurulumunun sonucu bu belge yazıldıktan sonra oluştu; log dosyasından kontrol edilmeli.
- Apple notarization yok (ad-hoc imza).
