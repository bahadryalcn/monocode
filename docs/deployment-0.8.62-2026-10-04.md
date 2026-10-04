# MonoCode 0.8.62 build ve kurulum

4 Ekim 2026: commit'lenmemiş çalışma ağacından sürüm 0.8.62 yapılarak derlendi ve kuruldu ([0.8.60 kurulumu](deployment-0.8.60-2026-10-04.md) ile aynı yöntem). Commit, push veya herkese açık release yapılmadı.

Bu sürümdeki host düzeltmesi: goal task'ları kendi worktree'si yerine projenin ana checkout'unda çalışıyordu. Planner, task prompt'larına ana projenin mutlak yolunu ("Yalnız /Users/bahadryalcn/projects/annem içinde çalış; worktree açma") yazıyordu; ajan bu talimata uyup değişiklikleri master'a yapıyordu. Task dalı boş kaldığı için reviewer FAIL veriyordu ("başlangıç commit'inden sonra değişiklik yok").

- `host/tasks.ts`: kendi worktree'sinde çalışan bir task'ın prompt'unun başına çalışma klasörü, dal ve "ana proje klasörüne dokunma, oradaki yollar bu klasördeki aynı dosyalar demek" notu ekleniyor.
- `host/goals.ts`: planner, task prompt'larında mutlak proje yolu kullanmıyor ve ajana klasör ya da dal söylemiyor.

| Bileşen | Önce | Sonra | Kontrol |
| --- | --- | --- | --- |
| Windows host | 0.8.60 | 0.8.62 | `status`: çalışıyor, port 3774; süreç yeni runtime'dan; DB `quick_check` ok |
| Mac host | 0.8.48 → 0.8.60 (09:02'de geçti) | 0.8.62 | LaunchAgent yeni runtime'ı çalıştırıyor; `status` ok; DB `quick_check` ok |
| Mac uygulama | 0.8.60 | 0.8.62 | Bundle sürümü, `codesign --verify --deep --strict` ok, süreç çalışıyor, yeni çökme kaydı yok |
| Windows uygulama | 0.8.60 | 0.8.62 (kurulum görevi) | `MonoCode Update 0.8.62` görevi; sonuç `%LOCALAPPDATA%\MonoCodeUpdate\install-0.8.62.log` içinde |

0.8.60'ın bekleyen iki adımı tamamlandı: Windows uygulama kurulumu 04:53'te 0.8.60'ı kurdu, Mac host 09:02'de 0.8.60'a geçti.

## Artifact'lar

- Windows kurulum dosyası: `target\release\bundle\nsis\MonoCode_0.8.62_x64-setup.exe`, 12.060.776 byte, SHA-256 `8a56649def5ea3339a0efa4487ca3b015cb54f6dc3c72c2f1cf25ccd76903d8e`; updater imzası aynı dizinde `.sig`.
- Windows host bundle: SHA-256 `02f0c590a781221028cfc231adf5690edbade6667eeae5f29377eea7ae9cafec`.
- Mac host paketi Mac'te derlendi: `monocode-host-darwin-arm64.tar.gz`, SHA-256 `dd37d4b55b05c3305fbf48476aa43effd6707e9d3c47093be3c376a1cbd1a2c0`; host bundle SHA-256 `3b92fa5072aeb6e393d3757bbc51fbee7ccda32341ae674fd62b20eac8b3967d`. Node 24.21.0.
- Mac kaynak snapshot'ı: `/Users/bahadryalcn/projects/monocode-build-0.8.62` (arşiv SHA-256 `80789d781f242d1d48a9cfd2b670bce7e198e79220dad04f9fc91a22c90300c5`, iki tarafta eşleşti); 0.8.47 build'inin `node_modules` klasörü kullanıldı.
- Build logları: `build\deployment-0.8.62\`.

## Kurulum ve geri dönüş

- Host runtime yolları: Windows `.monocode-host\runtime\0.8.62-win32-x64-manual`, Mac `.monocode-host/runtime/0.8.62-darwin-arm64-manual`. Öncekiler `*.before-0.8.62` olarak duruyor (Mac plist yedeği `~/.monocode-host/com.monocode.host.plist.before-0.8.62`).
- Mac'te önceki bundle: `/Applications/MonoCode-before-0.8.62.app`.
- Windows'ta önceki EXE: `%LOCALAPPDATA%\MonoCodeUpdate\rollback-before-0.8.62\monocode-0.8.60.exe`.
- Dört veritabanının SQLite online backup'ı `backups/update-0.8.62` altında; hepsinde `quick_check` ok.

## Veri doğrulaması

- Windows host: 14 proje / 6 cihaz / 2 oturum / 79 sync kaydı, önce ve sonra aynı; çalışan oturum yoktu.
- Mac host: 11 proje / 5 cihaz / 17 oturum / 1 goal / 20 task / 79 sync kaydı, önce ve sonra aynı; çalışan oturum yoktu.
- Mac uygulama: `quick_check` ok, 19 oturum; tur ortasında oturum yoktu.

## Testler

- `tsc` (uygulama ve host) temiz. Engine, tasks ve goals host testleri geçti; worktree task'ının prompt'u için kontrol eklendi.
- Tam host takımı: 291 testten 5'i başarısız. Hepsi git/süreç testlerinde 30 sn zaman aşımı ve Windows `EBUSY` hatası; başarısız olan testler her koşuda değişiyor.
- Tam uygulama takımı: 6166 testten 12'si başarısız. Tek başına yeniden koşulunca yalnızca `src/features/sessions/ui/hardBreaks.test.ts` (2 test) başarısız kaldı; bu hata `AgentMarkdown.tsx` üzerindeki commit'lenmemiş başka bir çalışmadan geliyor, bu sürümün host düzeltmeleriyle ilgisi yok.

## Mac'te açık kalan durum

`~/projects/annem` ana checkout'unda (master) ilk iki goal task'ının commit'lenmemiş işi duruyor. "Kur'an, hadis ve ses kaynaklarının hak/doğruluk kataloğu" blocked; "Eksiklerin denetimi" review'da. Bu iki task'ın worktree'leri boş. Kalan 18 task bunlara bağlı olduğu için sırada bekliyor. 0.8.62 sonrasında bu task'lar yeniden çalıştırılırsa kendi worktree'lerinde çalışırlar; master'daki iş ayrıca ele alınmalı.

## Yapılmayanlar

- Kimlik doğrulamalı RPC kontrolü ve yeni sürümde elle kullanım denemesi yapılmadı.
- Apple notarization yok (ad-hoc imza).
