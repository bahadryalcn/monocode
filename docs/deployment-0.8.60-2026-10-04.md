# MonoCode 0.8.60 build ve kurulum

4 Ekim 2026: commit'lenmemiş çalışma ağacından sürüm 0.8.60 yapılarak derlendi ve kuruldu ([0.8.48 kurulumu](deployment-0.8.48-2026-10-04.md) ile aynı yöntem). Commit, push veya herkese açık release yapılmadı.

Bu sürümdeki host düzeltmeleri:

- Goal planner'ın planı artık son turdaki bütün mesajlardan ve plan bloklarından okunuyor. Önceden yalnızca son mesaja bakılıyordu; plan modunda yazılan ya da arkasından kısa bir mesaj gelen plan "no ```json block" hatasıyla bloklanıyordu.
- Reviewer verdict'i son turdaki mesajlardan, VERDICT satırı olan en son mesajdan okunuyor.
- Host, desktop'un tur bitmeden kaydettiği eski bir kopyayla transkripti değiştirmiyor (`refreshFromDesktop`). "deneme mesajı" task'ındaki "Reviewer gave no verdict" hatasının nedeni buydu: reviewer PASS vermişti, ama cevabı desktop'un 00:39:07'de aldığı kopyayla silindi.

| Bileşen | Önce | Sonra | Kontrol |
| --- | --- | --- | --- |
| Windows host | 0.8.48 | 0.8.60 | `status`: çalışıyor, port 3774; süreç yeni runtime'dan; DB `quick_check` ok |
| Mac host | 0.8.48 | **beklemede** → 0.8.60 | Runtime hazır. `switch-host.sh` çalışan oturum kalmayınca geçişi yapıyor; sonuç `~/projects/monocode-build-0.8.60/switch-host.log` içinde |
| Mac uygulama | 0.8.48 | 0.8.60 | Bundle sürümü, `codesign --verify --deep --strict` ok, süreç çalışıyor, yeni çökme kaydı yok |
| Windows uygulama | 0.8.48 | 0.8.60 (kurulum görevi) | `MonoCode Update 0.8.60` görevi; sonuç `%LOCALAPPDATA%\MonoCodeUpdate\install-0.8.60.log` içinde |

## Mac host neden beklemede

Kurulum anında Mac host'ta bir Claude Opus oturumu tur ortasındaydı ("PRS polygenic risk scoring implementation review"). Host'u yeniden başlatmak bu turu keserdi. `switch-host.sh` 15 saniyede bir `status='running'` olan oturum sayısına bakıyor. Sayı sıfıra inince plist'i ve `runtime-path`'i 0.8.60'a çeviriyor, LaunchAgent'ı `bootout`/`bootstrap` ile yeniden başlatıyor, ardından `status` ve DB kontrolünü loga yazıyor.

## Artifact'lar

- Windows kurulum dosyası: `target\release\bundle\nsis\MonoCode_0.8.60_x64-setup.exe`, 12.063.090 byte, SHA-256 `d6acd38e899fbb7fad07cd19b0677864e1c3b71f5a69db737e90a899f0b90234`; updater imzası aynı dizinde `.sig`.
- Windows host bundle (`build\host\monocode-host.mjs`): SHA-256 `71bd4bc92a2302c7c71ad6f259e5de3672fa1db266919ea589c2a3a49ff41a1b`. Paket: `build\host-packages\monocode-host-win32-x64.zip`.
- Mac host paketi Mac'te derlendi (Windows'ta darwin paketi oluşturulamadı): `~/projects/monocode-build-0.8.60/build/host-packages/monocode-host-darwin-arm64.tar.gz`, SHA-256 `40afe5f327af1a2e99bf4060fa758e356efbc54272b1a4838645523d66a5f715`; host bundle SHA-256 `be6c10b819395dbd237385a9d5c762efe879461dd6f8e1c7986107ffbc1cb537`. Node 24.21.0.
- Mac kaynak snapshot'ı: `/Users/bahadryalcn/projects/monocode-build-0.8.60` (arşiv SHA-256 `976729ce86bf2d74cea93e94eb8666758be37f35fe0ae95030f90306581e7b5b`, iki tarafta eşleşti). Lockfile'da sürüm dışında değişiklik olmadığı için 0.8.47 build'inin `node_modules` klasörü kullanıldı.
- Build logları: `build\deployment-0.8.60\`.

## Kurulum ve geri dönüş

- Host runtime yolları: Windows `.monocode-host\runtime\0.8.60-win32-x64-manual`, Mac `.monocode-host/runtime/0.8.60-darwin-arm64-manual`. Öncekiler `*.before-0.8.60` olarak duruyor (Windows: `runtime-path`, `service.ps1`, `bin\monocode-host.cmd`; Mac: `runtime-path`, plist yedeği `~/.monocode-host/com.monocode.host.plist.before-0.8.60`; Mac'teki iki yedek geçiş anında oluşuyor).
- Mac'te önceki bundle: `/Applications/MonoCode-before-0.8.60.app`.
- Windows'ta önceki EXE: `%LOCALAPPDATA%\MonoCodeUpdate\rollback-before-0.8.60\monocode-0.8.48.exe`.
- SQLite online backup'ları `backups/update-0.8.60` altında, hepsinde `quick_check` ok: Windows host, Windows uygulama (`com.monocode.desktop.fork`), Mac host, Mac uygulama.

## Veri doğrulaması

- Windows host: kurulumdan önce ve sonra 14 proje / 6 cihaz / 2 oturum / 79 sync kaydı; `quick_check` ok. Çalışan oturum yoktu.
- Mac host (yedek anında): 11 proje / 5 cihaz / 10 oturum / 1 goal / 79 sync kaydı; çalışan oturum 1.
- Mac uygulama (kurulumdan sonra): `quick_check` ok, 12 oturum; tur ortasında oturum yoktu.

## Yapılmayanlar

- Build için tam test takımları yeniden çalıştırılmadı. `tsc` (uygulama ve host) temizdi. Engine, tasks ve goals host testleri (96) geçti. Tam host takımında `host/provider-transport.test.ts` içinde zamanlamaya bağlı görünen hatalar ile Claude reasoning effort argüman testi başarısız.
- Kimlik doğrulamalı RPC kontrolü yapılmadı; yalnızca host `status` ve DB kontrolleri yapıldı.
- Yeni sürümde elle kullanım denemesi yapılmadı.
- Apple notarization yok (ad-hoc imza).
