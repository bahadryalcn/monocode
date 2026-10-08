# Upstream v0.10.0 ilk uygulama paketi

Kaynak: `hardbeat920/monocode`, `v0.10.0`, `a3f6f8a44b5f25bf712cbdaed1c831caa278d658`. Araştırma tabanı ve bütün yayın maddeleri: [araştırma envanteri](upstream-v0.10.0-research-2026-10-08.md).

Kullanıcının “tamam bunları yapmaya başla” talebiyle önce küçük doğruluk düzeltmeleri ve provider/performance paketi uygulandı. Upstream dalı topluca merge edilmedi. Çalışma ağacındaki T3, host, cihaz, provider hesabı, Git mesajı ve yerel güncelleme işleri korunarak davranışlar mevcut sözleşmelere uyarlandı. Bu belge ilk paketin kaydıdır; 80 yayın maddesinin tamamlandığı anlamına gelmez.

## Uygulanan davranışlar

| Paket | Sonuç ve temel dosyalar |
|---|---|
| Codex model override | Model belirtilmediyse collaboration-mode model override gönderilmez; whitespace da model sayılmaz. `codexProtocol.ts` ve regresyonları. |
| Model katalogları | Fallback model listesi canlı katalog sayılmaz; Settings model seçicisi açılınca zorunlu yenileme ister. `ProviderSettings.tsx`, `settingsControls.tsx`. OpenCode catalog invalidation da alındı. |
| Composer IME | Textarea başlangıç taslağı mount boyunca sabit; draft senkronizasyonu mevcut yoldan devam eder. `Composer.tsx`, `Composer.ime.test.ts`. Gerçek IME aday penceresi kabulü yapılmadı. |
| Notes | Başlık odaktayken boş/boşluk taslağı korunur. Yeni notun ilk slug'ı başlık düzenlemesi tamamlanınca finalize edilir. Eski not slugs migration ile korunur; mevcut draft recovery/save queue devam eder. `NotesView.tsx`, `notes.ts`, Rust `notes.rs`. |
| Terminal | Yeni terminal aktif session'ın mevcut worktree'sini tercih eder; silinmiş worktree dışlanır. Genel/profile/dock/yeni-tab yolları ortak yardımcıyı kullanır. `terminalTab.ts`, `App.tsx`. |
| Git satırları | Dosya/klasör düğmeleri satırın tüm yüksekliğini kaplar. İnceleme raporundaki exact-path eksikliği varsayımı düzeltildi: mevcut `App.tsx` Git diff açma yolu zaten exact-path kullanıyordu, korundu. |
| FileTree klavyesi | Oklar, Home/End/Page, typeahead/cycle, klasör aç/kapat ve görünür focus. Yerel/remote dosya sözleşmesi korunur. `FileTree.tsx`. |
| OpenCode 2.x | v1/v2 detection, servis bağlantısı, model katalogları, event çevirme, soru/onay, resume/cancel/text yolları. Rust local ve remote host komut izinleri provider'a özel eklendi. `opencodeService.ts`, `opencodeV2Events.ts`, diğer OpenCode adapter dosyaları, `harness.rs`, `host/child-backend.ts`. Yerel ürün kimliği hata metninde korunur. |
| Codex asenkron soruları | Blocking panelin yanında async sorular görünür; cevap steer yoluyla gider; turn/cleanup yarışları adapter testlerinde kapsanır. Mevcut generated-images/account yolları korunur. |
| Geçici text oturumları | Grok/OpenCode geçici oturumları temizlenir. Codex kısa text isteği ephemeral olur ve işlem sonrası process bırakılır. Devam edilebilir yan soru çağrısı açıkça `ephemeral: false` kullanır; Git-generation hesap/model seçimi korunur. |
| Pi | Aynı turn/statusKey metni mevcut satırı günceller; boş metin kaldırır. Copilot iç/legacy modelleri ilgili kataloglarda filtrelenir. Protokolün yanında ortak `core/apply.ts` tüketicisi de güncellendi. |
| Event cadence | Foreground RAF ile background 100 ms kuyrukları ayrıldı; soru/onaylar gecikmeden teslim edilir; lifecycle flush/cancel korunur. `HarnessEventQueue`, `App.tsx`. |
| Transcript/index cache | Değişmeyen turn/item grupları WeakMap üzerinden, transcript pane props shallow karşılaştırmayla tekrar kullanılır. Local checkout index için bounded LRU ve checkout başına inflight; remote cache ve doğrudan path lookup korunur. |
| Transcript kaydırma | Settled turn için tahmini `content-visibility` yüksekliği kaldırıldı. Yönsüz trackpad olayı 150 ms follow beklemesi başlatır; yukarı hareket bekleme bitince aşağı sıçratmaz. Park edilmiş ve hâlâ end-follow yapan transcript tekrar bağlanınca aşağı pinlenir. Yerel scrollback/paging/resize politikası korunur. Upstream geçici debug logger'ı alınmadı. |
| Modal | Panel backdrop üzerinde; light tema paneli solid. Mevcut minimalHeader ve ürün stili korunur. Popover kaynağı bu küçük upstream değişiklikte zaten eşdeğerdi. |
| Test altyapısı | Host testleri seri ve 30 s timeout. Gerçek Chromium/WebKit transcript fixture'ı, ayrı Vite config ve `test:browser` komutu; exact dev dependency `@playwright/test@1.63.0`. |

## Doğrulama

Odaklı kontroller `.scratch/upstream-v010-*.log` dosyalarında tutuldu; bu geçici loglar ürün kaynaklarına dahil değildir.

- İlk geniş web çalışması: 24 dosya / 519 test, yalnız hardcoded upstream ürün adı assertion'ı başarısızdı. Yerel kimlik korunarak assertion düzeltildi; sonraki 8 dosya / 157 test çalışması başarılı.
- Notes ve transcript cache/pool: 3 dosya / 46 test başarılı.
- Pi/core apply ve registry: 2 dosya / 93 test başarılı.
- Son trackpad/Codex lifecycle/registry kontrolü: 3 dosya / 40 test başarılı. Test sayıları örtüşür; toplam bağımsız test sayısı gibi toplanmamalı.
- Host child-backend ve OpenCode v2 transport fixture: 2 dosya / 9 test başarılı.
- Rust notes: 17; skills: 33; exec allowlist: 4 test başarılı. Skill testi 1.400 girdili discovery'yi kapsar. Native test derlemesi başarılı.
- Web ve host TypeScript kontrolleri bu paketin son kaynak değişikliklerinden sonra başarılıydı. Daha sonra eşzamanlı çeviri çalışması yeni `src/shared/i18n` importları ekledi. En son yeniden kontrol, `i18n/index.ts` içindeki eksik `locales/tr.json`, `locales/zh-CN.json` ve ES2020 altında `String.replaceAll` hatalarıyla başarısız oldu. Bu nedenle bütün güncel çalışma ağacının geçerli olduğu iddia edilmez. Bu ayrı çalışmanın dosyaları değiştirilmedi.
- Gerçek browser kaydırma aralığı testi önce WebKit'te, ayrı tekrarında Chromium'da başarılı. Son fixture ile Chromium'da kaydırma aralığı ve park/return testlerinin ikisi de başarılı. Aynı son turda WebKit önce deferred 20-turn render'ını 5 s içinde beklerken başarısız oldu; sonraki sayfa yüklemesi eşzamanlı çeviri çalışmasının çözülmemiş `src/shared/i18n` importları nedeniyle engellendi. Fixture'ın unsupported `initialTurns` prop'u kaldırıldı ve tam geçmişe geçişi bekleyen assertion 30 s yapıldı; bu son fixture değişikliği henüz temiz çalışma ağacında yeniden doğrulanmadı. Kaydırma/assertion ölçütleri gevşetilmedi.
- Etkilenen kaynaklar için `git diff --check` whitespace hatası göstermedi; Windows CRLF normalizasyon uyarıları çıktı.

## Kabul sınırı ve sonraki aşamalar

Provider testleri fixture/mock temellidir. Gerçek kurulu OpenCode 2.x servisinde local/remote hesap, canlı Codex async soru, gerçek WebKit IME aday seçimi ve kurulu desktop kabulü yapılmadı. Paket/build/install/commit/push yapılmadı. Bu değişikliklerin kurulu uygulamada görünür olduğu iddia edilmez.

Kalıcı ajan profili, Soul/Memory/Habits ve host scheduler bağlantısı henüz uygulanmadı. Markdown belge artifacts, floating/native Codex store, macOS glass ve Linux release kanalları ayrı aşamalardır. Mevcut host scheduling ve HTML artifact yetkilendirmesi yanında ikinci bir timer/persistence otoritesi kurulmadı. Diğer küçük editor/font/effort polish ve Mono'ya özel scroll/header görünümü de bu ilk pakete dahil değildir.
