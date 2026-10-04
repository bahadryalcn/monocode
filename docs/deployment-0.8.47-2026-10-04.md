# MonoCode 0.8.47 build ve kurulum

4 Ekim 2026: çalışma ağacındaki performans değişiklikleri ([4 Ekim listesi](performance-todo-2026-10-04.md), [3 Ekim listesi](performance-todo-2026-10-03.md)) ve aynı ağaçtaki commit'lenmemiş pencere ayırma değişiklikleriyle birlikte sürüm 0.8.47 yapılarak derlendi ve kuruldu. Commit, push veya herkese açık release yapılmadı; kurulan sürüm commit'lenmemiş çalışma ağacından derlendi.

| Bileşen | Önce | Sonra | Kontrol |
| --- | --- | --- | --- |
| Windows host | 0.8.46 (çalışmıyordu) | 0.8.47 | `status`: çalışıyor, port 3774; DB `quick_check` ok; yeni kolonlar mevcut |
| Mac host | 0.8.46 | 0.8.47 | LaunchAgent yeni runtime'ı çalıştırıyor; `status` ok; DB `quick_check` ok |
| Mac uygulama | 0.8.46 | 0.8.47 | Bundle sürümü, ad-hoc codesign doğrulaması, süreç çalışıyor, yeni çökme kaydı yok |
| Windows uygulama | 0.8.46 | **beklemede** → 0.8.47 | `MonoCode Update 0.8.47` zamanlanmış görevi MonoCode kapanınca sessiz kurulumu yapıp uygulamayı yeniden açar. Kurulum anında başka bir oturum tur ortasında olduğu için uygulama zorla kapatılmadı. Sonuç `%LOCALAPPDATA%\MonoCodeUpdate\install-0.8.47.log` içinde. |

## Dikkat: Windows host kurulumdan önce kapalıydı

Güncelleme başlarken Windows host süreci yoktu ve 3774 portu dinlenmiyordu; `host.log` son olarak 01:46'da yazılmıştı, zamanlanmış görev 02:03'te başlatılıp `0xC000013A` ile sonlanmıştı. Neden durduğu belirlenmedi. 0.8.47 kurulumundan sonra görev yeniden başlatıldı ve host çalışıyor.

## Artifact'lar

- Windows kurulum dosyası: `target\release\bundle\nsis\MonoCode_0.8.47_x64-setup.exe`, 12.037.016 byte, SHA-256 `820EAE3859652B384476757A1B823D5236D98E516713A592F2A26195D89F8B39`; updater imzası aynı dizinde `.sig`.
- Host bundle (`build\host\monocode-host.mjs`): SHA-256 `04BDC182BEBB40BDDFAA80F8094FE2463CFAA50D17259A4435C49D3A80E81DA9`.
- Host paketleri: `build\host-packages\monocode-host-win32-x64.zip`, `monocode-host-darwin-arm64.tar.gz` (SHA-256 `c5dda9925729ac27bbdb9c736b41f0ef6749f6b1e350e8ebf2843dfbb35e85b9`, Mac'te doğrulandı). Node 24.21.0.
- Mac kaynak snapshot'ı: `/Users/bahadryalcn/projects/monocode-build-0.8.47` (arşiv SHA-256 `2c3f8708e5bc7bb0a48b2d16ed23b4a17825af12758bf056ca094686940f7d24`, iki tarafta eşleşti). Bu kez `npm ci` çalıştırıldı (yeni bağımlılıklar: `zustand`, `@xterm/addon-webgl`).
- Build logları: `build\deployment-0.8.47\`.

## Kurulum ve geri dönüş

- Host runtime yolları: Windows `.monocode-host\runtime\0.8.47-win32-x64-manual`, Mac `.monocode-host/runtime/0.8.47-darwin-arm64-manual`. Launcher, `runtime-path` ve servis dosyası bu sürüme yönlendirildi; öncekiler `*.before-0.8.47` olarak duruyor (Mac plist yedeği `~/.monocode-host/com.monocode.host.plist.before-0.8.47`).
- Mac'te önceki bundle: `/Applications/MonoCode-before-0.8.47.app`.
- Windows'ta önceki EXE: `%LOCALAPPDATA%\MonoCodeUpdate\rollback-before-0.8.47\monocode-0.8.46.exe`.
- Dört veritabanının SQLite online backup'ı kendi veri dizinlerinde `backups/update-0.8.47` altında; yedeklerde `quick_check` ok.
- **Host şeması tek yönlü:** 0.8.47 host `sessions` tablosuna kolonlar ve `receipts.created_at` ekliyor. Eski host sürümüne dönülürse eski kodun konumsal `receipts` eklemesi bozulur; geri dönüş gerekiyorsa `backups/update-0.8.47/host.db` yedeğiyle birlikte dönülmeli.

## Veri doğrulaması

- Kurulum öncesi: Windows uygulama 184 oturum; Windows host 14 proje / 6 cihaz / 2 oturum; Mac uygulama 10 oturum; Mac host 11 proje / 5 cihaz / 7 oturum. İki hostta da çalışan oturum yoktu.
- Kurulum sonrası: iki hostta `quick_check` ok ve aynı sayılar (sync kaydı 79); Mac uygulama DB'sinde `quick_check` ok, 10 oturum, yeni index'ler (`sessions_recent_idx`, `sessions_linked_idx`) oluşmuş.
- Kimlik doğrulamalı RPC kontrolü (`environment.describe`, `projects.list`, `sync.pull`) bu kez **yapılmadı**; yalnızca host `status` ve DB kontrolleri yapıldı.

## Yapılmayanlar

- Yeni sürümde elle kullanım denemesi (oturum açma, akış, pencere ayırma, terminal, diff görünümü, uzak oturum) yapılmadı.
- CPU/ağ/açılış süresi ölçümü yapılmadı.
- Windows uygulama kurulumunun sonucu bu belge yazıldıktan sonra oluştu; log dosyasından kontrol edilmeli.
- Apple notarization yok (ad-hoc imza).
