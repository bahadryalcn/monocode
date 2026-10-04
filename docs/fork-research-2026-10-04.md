# MonoCode fork geliştirmeleri ve aktarım adayları

4 Ekim 2026 tarihinde 249 erişilebilir public fork ve bunların 1.534 dalı incelendi. Aşağıdaki ilk 10 fork, upstream ana dalı ve mevcut upstream geliştirme dalları dışında kalan farklı yamaların sayısına göre sıralandı. Uygulama koduna merge, cherry-pick veya başka değişiklik uygulanmadı. Bulgular bu çalışma klasöründeki HEAD ve mevcut commitlenmemiş dosyalarla karşılaştırıldı.

Karşılaştırma sonucu özellikle WSL, agent kontrollü tarayıcı, ortak skill yönetimi, yerel dikte, sprint planlama ve provider cloud işleri yeni kapsam sunuyor. Explorer cache yaşam döngüsü, syntax worker ve kuyruk mesajının modelini sabitleme daha sınırlı ve ölçülebilir iyileştirme adayları.

## Sıralamanın anlamı

`Son push` ve yıldız sayısını geliştirme ölçüsü olarak kullanmadım. GitHub compare API ile bütün varsayılan dalları, branches API ile bütün görünür dalları taradım. Kendi forkumuz sıralama dışında. En az 15 upstream dışı non-merge commit gözlenen 44 diğer fork ve ek sınır adaylarının Git nesneleri ayrı bir geçici bare repoda indirildi. Mevcut upstream dallarından erişilen commitler çıkarıldı; kalanlar `git patch-id --stable` ile normalize edildi. Aynı değişikliğin bir dalda ve squash/yeniden yazılmış dalda tekrar görünmesi mümkün olduğunda tek yama olarak sayıldı.

Bu sayı yeni özellik adedi veya kalite puanı değildir: test, doküman, release, prototip ve branch üzerinde kalmış iş de içerir. Patch-id aynı anlamdaki farklı biçimde yazılmış kodu ve squash edilmiş büyük bir commitin içindeki küçük commitleri kusursuz eşleştirmez. Bu yüzden bizde bulunmama kararı ayrıca güncel kod ve değişikliğin diffi üzerinden verildi. Bir fork içindeki her commitin özgün yazarı fork sahibi olmayabilir. Ranking tüm görünür dalları kapsar; tabloda yazan varsayılan dal bütün adayları içermeyebilir.

Yerel HEAD: `86a563aeedf9aac24b0724ad31c7945e0e21a9f2`. İlk upstream main snapshotı: `271b66ded71e795e0569db77c9bbf599219c8cdc`. API örneklemi sırasında fork/branch/head değişebilir. Silinmiş, private, API dışında kalan bağımsız kopyalar ve her depodaki ilk 100den fazla dal bu araştırmanın kapsamı dışında; listedeki depolarda branch limitine ulaşan bir sonuç görülmedi.

## En çok geliştirme görülen 10 fork

| Sıra | Fork | Farklı yama | Merge hariç commit | Varsayılan dal | Öne çıkan kapsam |
| --- | --- | ---: | ---: | --- | --- |
| 1 | [mondary/monocode](https://github.com/mondary/monocode) | 186 | 191 | `perso/pk` | Özel providerlar, proje başlangıcı, not export, kişisel PK UI ve CodexBar |
| 2 | [Nishanth-sebastin/monocode](https://github.com/Nishanth-sebastin/monocode) | 175 | 177 | `main` | WSL, tarayıcı, Azure Pipelines, dikte, attention/watchers |
| 3 | [sambhavthakkar/monocode](https://github.com/sambhavthakkar/monocode) | 163 | 166 | `main` | Arama/explorer/context performansı ve yarış durumları; kısayollar ve clipboard |
| 4 | [imnakul/monocode-clone](https://github.com/imnakul/monocode-clone) | 158 | 160 | `main` | Cloud/native provider oturumları, MCP izinleri, context tanısı, Session Manager |
| 5 | [zaesho/monocode](https://github.com/zaesho/monocode) | 117 | 123 | `main` | Factory Droid, shared skills, sağlam handoff/kuyruk; GPUI portu |
| 6 | [mstfmedeni/monocode](https://github.com/mstfmedeni/monocode) | 110 | 112 | `main` | Claude Remote Control bridge ve transcript/approval toparlanması |
| 7 | [Warexpor/monocode](https://github.com/Warexpor/monocode) | 94 | 111 | `main` | Windows/Grok odaklı geliştirmeler, kurulum sihirbazı ve transcript polish |
| 8 | [Dreckiez/polycode](https://github.com/Dreckiez/polycode) | 79 | 80 | `modification` | Worker, sanallaştırma, streaming izolasyonu; Polycode refactorları |
| 9 | [igortarasuk/monocode](https://github.com/igortarasuk/monocode) | 57 | 57 | `monochrome` | Sprint/saat planlama, Teleport, Laya/Ollama, Assistants |
| 10 | [itizarsa/monocode](https://github.com/itizarsa/monocode) | 52 | 58 | `main` | Hesap/usage/terminal/continuation iyileştirmeleri ve prototip task işleri |

Örneğin wanyest/Copilot forkunda default branch 32 ahead görünürken merge hariç yalnız 6 farklı yama var. mondarynin default `perso/pk` dalına ek olarak `stable/pk` çalışmaları; Polycodeun `modification` dalı; Nishanthın `legacy/kaceper11-main` tarayıcı çalışmaları ve diğer feature dalları özellikle önemli.

## Önce değerlendirmeye değer adaylar

Aşağıdaki sıra bir uygulama kararı değil; kullanıcı faydası, bağımsız taşınabilirlik ve bizim mevcut kodu tekrar etmeme açısından önerimdir. Performans kazanımları bu araştırmada benchmark edilmedi.

| Aday | Öneri | Uyarlama |
| --- | --- | --- |
| [F10](#f10) | Explorer önbelleğini yalnız görünür klasörlerle sınırlama | Orta |
| [F11](#f11) | Geç kalan explorer cevaplarının cacheyi geri doldurmasını önleme | Küçük orta |
| [F19](#f19) | Kuyruktaki mesajı kaydedildiği model ve effort ile gönderme | Orta |
| [F25](#f25) | Diff syntax highlighting işini Web Worker içine taşıma | Orta |
| [F34](#f34) | Büyüyen usage loglarını kaldığı offsetten okuma | Orta |
| [F07](#f07) | Azure Pipelines çalışma ve loglarını uygulamada inceleme | Orta büyük |
| [F08](#f08) | Yerel Whisper diktesi ve basılı tutarak konuşma | Orta büyük |
| [F18](#f18) | Sağlayıcılar arasında ortak skill kütüphanesi | Orta büyük |
| [F05](#f05) | Uygulama içi tarayıcı ve agent tarafından kontrol edilen önizleme | Büyük |
| [F06](#f06) | WSL projelerinde dosya Git terminal ve agent işlemleri | Büyük |

## Fork bazında özellik ve commit notları

**Bizde yok:** kaynak davranış için mevcut uygulamada karşılık bulunmadı. **Bizde kısmen var:** temel yetenek bizde var; öneri belirtilen ek kapsam veya farklı uygulama. **Araştırma seçeneği:** kapsamlı mimari değişim, olağan bir commit aktarımı değil. Hiçbiri burada canlı çalıştırılıp ürün kabul testinden geçirilmiş sayılmıyor.

### mondary/monocode

<a id="f01"></a>
#### F01 OpenAI uyumlu özel sağlayıcılar

**Durum:** Bizde yok. **Uyarlama:** Orta büyük.

Kullanıcının endpoint, model ve sağlayıcı tanımlayıp model seçicide ayrı sekme olarak kullanması.

**Commitler:** [`3a1eb0df6c`](https://github.com/mondary/monocode/commit/3a1eb0df6ca2a80cc3a8c4078c8e13f22d5bb8e6) ADD: scope de fond par panneau et providers custom compatibles openai, [`4f17d97949`](https://github.com/mondary/monocode/commit/4f17d979492468125c3d761d93c9921815427f82) ADD first-class OpenAI-compatible provider tabs.

**Bizim kod:** src/features/sessions/model/session.ts içindeki HarnessId ve mevcut provider kayıtları sabit CLI sağlayıcılarını tanımlıyor. src-tauri/src/custom_providers.rs ve özel sağlayıcı ayar modeli bizde yok.

**Aktarım notu:** Kaynak OpenCode üzerinden bağlantı kuruyor; doğrudan API sağlayıcısı sanılmamalı. Hesap anahtarlarının saklanması ve uzak host sözleşmesi bizim tasarımla birleştirilmeli.

**Uygulama sonrası kontrol:** Özel endpoint ekleme, model keşfi, gönderme, devam etme ve hesap kaldırma; anahtarın log/transcriptte bulunmaması.

<a id="f02"></a>
#### F02 Proje başlangıcında ortak kuralları symlink ile bağlama

**Durum:** Bizde yok. **Uyarlama:** Orta.

Ortak AGENTS, CLAUDE ve proje başlangıç dosyalarını her repoda tekrar kopyalamadan kullanmak.

**Commitler:** [`4db1d26bf1`](https://github.com/mondary/monocode/commit/4db1d26bf1bfcc6aa81473df855a77dd338a4059) ADD: initialisation de projet par symlinks configurable.

**Bizim kod:** src-tauri/src/skills.rs skill keşfi ve aktarımı içeriyor; kaynakta eklenen project_init.rs ile ayarlanabilir başlangıç hedefleri bizde yok.

**Aktarım notu:** Windows symlink yetkisi, junction alternatifi, mevcut hedeflerin korunması ve bizim skill güvenlik kontrolleri birlikte ele alınmalı.

**Uygulama sonrası kontrol:** Boş ve mevcut projede başlatma; mevcut dosyayı ezmeme; Windows yetkisiz durumda açıklayıcı hata ve geri alınabilir sonuç.

<a id="f03"></a>
#### F03 Notları Markdown olarak dışa aktarma ve projeye otomatik yazma

**Durum:** Bizde yok. **Uyarlama:** Orta.

Uygulama notlarını repoda okunabilir Markdown dosyaları olarak kullanmak ve güncel tutmak.

**Commitler:** [`82e0690d90`](https://github.com/mondary/monocode/commit/82e0690d90ac4da392b9446ae3f7e0a94fe3c5f3) ADD: export markdown des notes et auto-export vers le projet.

**Bizim kod:** src-tauri/src/notes.rs ve src/features/notes/ui/NotesView.tsx not ve görsel saklıyor; kaynak export/auto-export komutları ve ayarları bizde yok.

**Aktarım notu:** Notlar global olabiliyor: kullanıcı bir proje seçmeden otomatik repo yazımı açılmamalı. Görsel yolları ve isim çakışmaları uyarlanmalı.

**Uygulama sonrası kontrol:** Türkçe başlık, görselli not, aynı adlı notlar, silme ve otomatik dışa aktarmayı kapatma; hedef dışına dosya yazılmaması.

<a id="f04"></a>
#### F04 CodexBar üzerinden ilave sağlayıcı kota bilgileri

**Durum:** Bizde yok. **Uyarlama:** Orta.

Mevcut kota altyapısını harici CodexBar katalog ve hesap verileriyle genişletmek.

**Commitler:** [`980d1aa5bf`](https://github.com/mondary/monocode/commit/980d1aa5bfa889af40a3ea85355fa318cc7fc931) feat: integrer codexbar et marquer les options pk.

**Bizim kod:** src/features/providers/model/accountUsage.ts ve src-tauri/src/rate_limits.rs kendi sağlayıcı verilerini topluyor; CodexBar entegrasyonu bulunmuyor.

**Aktarım notu:** Kaynak ağırlıkla macOS kişisel yapılandırmasına bağlı. Windows için doğrudan taşınabilir özellik olarak değerlendirilmemeli.

**Uygulama sonrası kontrol:** CodexBar yokken normal çalışma; eksik/eski katalog ve birden fazla hesabın doğru eşleşmesi; macOS üzerinde gerçek entegrasyon kontrolü.

### Nishanth-sebastin/monocode

<a id="f05"></a>
#### F05 Uygulama içi tarayıcı ve agent tarafından kontrol edilen önizleme

**Durum:** Bizde kısmen var. **Uyarlama:** Büyük.

Dev server sayfasını uygulama yanında açmak; agentın sayfayı incelemesi, ekran görüntüsü ve element seçimiyle çalışması.

**Commitler:** [`fbdc31d978`](https://github.com/Nishanth-sebastin/monocode/commit/fbdc31d9785c5760e684cf2bc3b292ed31da8504) feat: in-app browser preview pane, [`0cecf28f54`](https://github.com/Nishanth-sebastin/monocode/commit/0cecf28f5461a4f636407a72295fad02ef7d8ea4) feat: let agents drive the in-app browser, [`16e02afdd1`](https://github.com/Nishanth-sebastin/monocode/commit/16e02afdd14eb7ba889317c282f3882e7faf97ee) feat: dev-server previews, auto-verify and element picking, [`e6b6a399c0`](https://github.com/Nishanth-sebastin/monocode/commit/e6b6a399c0e62cc7b7a5d76c3ac2ed906c5b7d6a) fix: host the browser in an attached window, not a child webview.

**Bizim kod:** Bizde src-tauri/src/html_preview.rs ve FileEditor Go Live var. Bunlar kaynak browser.rs/browser kontrol yüzeyi ile adres çubuğu ve agent tarayıcı komutlarının tamamını sağlamıyor.

**Aktarım notu:** Sonraki düzeltme tarayıcıyı child webview yerine bağlı pencereye taşıyor. İlk commit tek başına alınmamalı; Windows odak, kapanış ve IPC kapsamı bizim çoklu pencere yapısıyla tasarlanmalı.

**Uygulama sonrası kontrol:** localhost dev server, yönlendirme/iframe, ekran görüntüsü, element seçimi, pencere kapanışı ve başka projeye geçiş; agent erişiminin doğru oturumla sınırlanması.

<a id="f06"></a>
#### F06 WSL projelerinde dosya Git terminal ve agent işlemleri

**Durum:** Bizde yok. **Uyarlama:** Büyük.

Windows uygulamasından Linux dağıtımı içinde proje açıp dosya, Git, terminal, agent ve checkpoint işlemlerini Linux tarafında yürütmek.

**Commitler:** [`1a5750fcce`](https://github.com/Nishanth-sebastin/monocode/commit/1a5750fcce1f76c3145fe64628f7214e7bb3a73b) Route WSL filesystem and Git IO through a bounded Linux process, [`0201d20fed`](https://github.com/Nishanth-sebastin/monocode/commit/0201d20fed71c17dd2d5416f0b947334d8b103ab) Keep WSL path identity through project and file navigation, [`2fcbcf248b`](https://github.com/Nishanth-sebastin/monocode/commit/2fcbcf248b58c3db8870b0b854ffbb348914ce6b) Implement app-open WSL agents, terminal and repository workflows, [`e49064a349`](https://github.com/Nishanth-sebastin/monocode/commit/e49064a34962429ce2a2aec1aec99a49061ccc3d) Route WSL checkpoints and skills through Linux, [`b1f737ebfe`](https://github.com/Nishanth-sebastin/monocode/commit/b1f737ebfe589e3dd942db210bc5d8d1800bba27) Isolate WSL reads and checkpoint hosts without polling.

**Bizim kod:** Bizde host/SSH uzak makine altyapısı var. src-tauri/src/lib.rs içinde WSL backend kaydı ve kaynak wsl/WSL proje kimliği sözleşmesi bulunmuyor; SSH ile WSL erişimi aynı özellik değil.

**Aktarım notu:** UNC yolunu yalnızca Windows dosya yolu gibi geçirmek yeterli değil. Dağıtım kimliği, Linux binary/PATH, checkpoint ve disconnect davranışı birlikte taşınmalı.

**Uygulama sonrası kontrol:** İki dağıtım ve boşluklu yol; Linux Git izinleri, terminal, agent katalogları, branch/worktree ve checkpoint; dağıtım kapalıyken toparlanma.

<a id="f07"></a>
#### F07 Azure Pipelines çalışma ve loglarını uygulamada inceleme

**Durum:** Bizde kısmen var. **Uyarlama:** Orta büyük.

Azure Boards/Repos yanında pipeline eşlemesi, run durumu ve log üzerinden CI incelemesi.

**Commitler:** [`ef3dd40d36`](https://github.com/Nishanth-sebastin/monocode/commit/ef3dd40d36e2c7a700d1883cf8eef4af4b845eaf) feat: inspect independently mapped Azure Pipelines runs and logs, [`59b99a0008`](https://github.com/Nishanth-sebastin/monocode/commit/59b99a0008703fe127b9faefccf680fc47c3b16e) fix: redact separated secret keys in pipeline logs.

**Bizim kod:** src-tauri/src/azure_devops.rs ve src/features/inbox/model/azureDevOps.ts zaten Boards ve PR işlemlerini sağlıyor. _apis/build pipeline/run/log komutları bulunmuyor.

**Aktarım notu:** PR ve pipeline farklı projelerde eşlenebiliyor. Log redaksiyonu düzeltmesi ana özellikle birlikte değerlendirilmeli.

**Uygulama sonrası kontrol:** Ayrı pipeline projesi eşlemesi, failed/success run, büyük log ve erişim hatası; ayrık biçimde yazılmış gizli değerlerin de maskelenmesi.

<a id="f08"></a>
#### F08 Yerel Whisper diktesi ve basılı tutarak konuşma

**Durum:** Bizde yok. **Uyarlama:** Orta büyük.

Mikrofondan konuşmayı yerelde prompta çevirmek; model/dil seçimi ve hold-to-talk kısayolu.

**Commitler:** [`09ed4c27de`](https://github.com/Nishanth-sebastin/monocode/commit/09ed4c27deeb674eab7e04946510ab1ba6d3a904) feat: local dictation groundwork — whisper engine, capture, model management, [`2a9fb11511`](https://github.com/Nishanth-sebastin/monocode/commit/2a9fb1151158498aba987879b31fbd7fbfd86521) feat: composer dictation UI, hold-to-talk, and Cmd+Shift+D shortcut, [`105e5d5c2b`](https://github.com/Nishanth-sebastin/monocode/commit/105e5d5c2bf461932738d060cd9d911197b7ee7f) feat: full whisper language set in a filterable dictation picker, [`73766d58f7`](https://github.com/Nishanth-sebastin/monocode/commit/73766d58f72fc0b5d876174b3772233ea190b57e) fix: dictation start-phase leaks, hold release, selection restore.

**Bizim kod:** Composer ve ayarlarda dictation modülü, Whisper backend ve mikrofon kayıt akışı bulunmuyor. speechBubble.ts konuşma balonu metinleriyle ilgili; ses tanıma değil.

**Aktarım notu:** Model indirme, CPU/RAM, mikrofon izinleri, tuş bırakma ve pencere kapanışında kaydı durdurma önemli. Forkta çoklu platform CI düzeltmesi olması Windows mikrofon kabul testi yerine geçmez.

**Uygulama sonrası kontrol:** Türkçe dikte, seçili metne ekleme, kısa/boş kayıt, hold tuşunu bırakma, kayıt sırasında pencere kapatma; Windows mikrofonuyla gerçek deneme.

<a id="f09"></a>
#### F09 Dikkat kuyruğu ve PR sağlayıcı watcherları

**Durum:** Bizde kısmen var. **Uyarlama:** Büyük.

İnsan müdahalesi isteyen işleri tek sırada görmek; sağlayıcı/PR olaylarını izleyip tamamlanan watcherı kaldırmak.

**Commitler:** [`fbef9e4b4c`](https://github.com/Nishanth-sebastin/monocode/commit/fbef9e4b4c032161ae79ad2ccb41078912347caa) feat: attention queue and provider watchers (#76, #23), [`692f8fe08e`](https://github.com/Nishanth-sebastin/monocode/commit/692f8fe08e6b37b13509e0a6710385edaa3a1717) fix: review pass — watcher correctness, safety bindings, queue a11y, [`0db2e87840`](https://github.com/Nishanth-sebastin/monocode/commit/0db2e878401cb72c50161d6e2289106f0202c29a) feat: retire watchers when their pull request completes.

**Bizim kod:** Bizde Tasks, goals, stewards, Inbox ve bildirimler var. Kaynağın özel attention queue ve provider watcher ekran/yaşam döngüsü bunlarla aynı uygulama değil.

**Aktarım notu:** Mevcut host stewards ve task limitleriyle ikinci bağımsız otomasyon motoru oluşturulmadan birleştirilmeli. Bu madde eksik görev altyapısı iddiası değil.

**Uygulama sonrası kontrol:** Onay gerektiren işin görünmesi, doğru oturuma geçiş, tamamlanan PR için watcherın durması, restart sonrası yinelenen iş başlatmama.

### sambhavthakkar/monocode

<a id="f10"></a>
#### F10 Explorer önbelleğini yalnız görünür klasörlerle sınırlama

**Durum:** Bizde kısmen var. **Uyarlama:** Orta.

Kapatılmış klasörler ve eski projeler için bellekte tutulmuş listeleri ve gereksiz yeniden okumaları azaltmak.

**Commitler:** [`ebd829c658`](https://github.com/sambhavthakkar/monocode/commit/ebd829c65875bd60c64eef73ab3e29cf15da51b3) Keep only the explorer folders on screen cached, [`f2e97d5c9d`](https://github.com/sambhavthakkar/monocode/commit/f2e97d5c9d0f46c14c5c3e3cfec4ae8eb1f563ed) Skip collapsed subtrees when refreshing explorer listings, [`23ca13cabc`](https://github.com/sambhavthakkar/monocode/commit/23ca13cabc23185f8b5cd5e82ded5273fa8e293f) Prune expanded subtrees on collapse and on delete unconditionally.

**Bizim kod:** src/features/files/model/fileTree.ts dirs Map ve activeRoots tutuyor. refreshCachedDirs aynı aktif kökün cachelenmiş tüm alt yollarını tarıyor; saveExpanded görünür alt ağaçlarla cacheyi budamıyor.

**Aktarım notu:** Bizim uzak makine bağlantısı kesilince son listeyi gösterme davranışı korunmalı; daraltma ve silme farklı yaşam döngüleri.

**Uygulama sonrası kontrol:** Binlerce klasörü açıp kapattıktan sonra cache ve uzak çağrı sayısının düşmesi; seçili dosya/rename/drag hedefinin ve offline son listenin korunması.

<a id="f11"></a>
#### F11 Geç kalan explorer cevaplarının cacheyi geri doldurmasını önleme

**Durum:** Bizde kısmen var. **Uyarlama:** Küçük orta.

Eski listDir cevabının daha yeni listeyi ezmesini veya kapatılıp atılmış klasörü tekrar cacheye sokmasını önlemek.

**Commitler:** [`46cfb76432`](https://github.com/sambhavthakkar/monocode/commit/46cfb764326eeda3ee18b61e6cf6b564d428f2ab) Keep same-path listings latest-wins, [`1af9a7b2af`](https://github.com/sambhavthakkar/monocode/commit/1af9a7b2af35bc76d01a0315471ffc2dc789e5ec) Ignore listings that land after their folder was evicted.

**Bizim kod:** fileTree.ts listCachedDir tamamlandığında dirs.set(path, entries) çalıştırıyor; forgetDir cacheyi silse de in-flight cevabın yazmasını sürüm/generation ile engellemiyor.

**Aktarım notu:** Önceki explorer cache maddesiyle birlikte taşınabilir. Yerel ve uzak hata toparlanmasının yanlışlıkla eski generationı yeniden geçerli kılmaması gerekiyor.

**Uygulama sonrası kontrol:** Yavaş ilk cevap ve hızlı ikinci cevap; cevap gelmeden klasörü kapatma/silme; cachede son geçerli listenin kalması.

<a id="f12"></a>
#### F12 Compaction sınırında eski context değerini temizleme

**Durum:** Bizde kısmen var. **Uyarlama:** Orta.

Özetleme sonrasında güncel ölçüm gelmeden eski doluluğu gerçek değer gibi göstermemek; Pi/OMP ve model değişimlerini doğru izlemek.

**Commitler:** [`c441d862ee`](https://github.com/sambhavthakkar/monocode/commit/c441d862eeb4387128980173fad3332102c663c5) Retire context level at compaction boundary instead of showing stale height, [`d31e642115`](https://github.com/sambhavthakkar/monocode/commit/d31e6421158886fd027b747182d5b7b0442318fa) Mark the Pi/OMP auto-compaction boundary, [`51af6fd470`](https://github.com/sambhavthakkar/monocode/commit/51af6fd470c509570be781ceb8a3106b3c395ddb) Read the context window from the model the main loop used.

**Bizim kod:** src/features/sessions/model/contextUsage.ts güncel usage değerini birleştiriyor; yeni ölçümde window yoksa önceki değeri koruyor. Kaynaktaki açık stale/compaction boundary yaklaşımı farklı.

**Aktarım notu:** Mevcut sağlayıcı olaylarıyla tek tek karşılaştırılmalı. Statik fark performans veya yanlış gösterim hatasının canlı ortamda kanıtlandığı anlamına gelmez.

**Uygulama sonrası kontrol:** Claude, Codex, Pi/OMP compaction öncesi/sonrası; model değişimi; yeni ölçüm yokken eski oran yerine belirsizliğin gösterilmesi.

### imnakul/monocode-clone

<a id="f13"></a>
#### F13 Local Cloud seçimi ve sağlayıcı cloud işleri

**Durum:** Bizde yok. **Uyarlama:** Büyük.

Composer üzerinden sağlayıcının kendi cloud task backendine iş göndermek ve durumunu uygulamada izlemek.

**Commitler:** [`67eb8c4028`](https://github.com/imnakul/monocode-clone/commit/67eb8c4028ea87826bcb29ab80cb9a7a174ece7c) feat: add native provider sessions, Claude RC and cloud backend, [`ff70130dca`](https://github.com/imnakul/monocode-clone/commit/ff70130dcae3d687d5ee234844641ce67615e239) feat: Local | Cloud launch in the session composer and cloud task view.

**Bizim kod:** Bizde src/features/connections ve host uzak oturumları var; bunlar sağlayıcı cloud task launcher ve cloud task view ile aynı değil. Cloud/native provider session modülleri bulunmuyor.

**Aktarım notu:** CLI sağlayıcılarının cloud desteği ve hesap kapsamı doğrulanmalı; var olan host remote sözleşmesi üzerine yanlışlıkla eşlenmemeli.

**Uygulama sonrası kontrol:** Local/cloud seçimi, desteklemeyen sağlayıcı, cloud iş oluşturma ve durum takibi; gerçek yetkili sağlayıcı hesabıyla kabul testi.

<a id="f14"></a>
#### F14 MCP sunucularını açıp kapatma ve sohbete özel onay

**Durum:** Bizde kısmen var. **Uyarlama:** Orta büyük.

Sunucu keşfinin yanında kullanım izinlerini ve sohbet kapsamındaki onayı yönetmek.

**Commitler:** [`647cf0919e`](https://github.com/imnakul/monocode-clone/commit/647cf0919e77cbbb30c714aa0797525a79ef90ae) Add MCP toggles and chat-scoped server approvals.

**Bizim kod:** McpSettings.tsx ve src-tauri/src/mcp.rs bağlantı keşfi/konfigürasyon yönetimi var. Kaynak chat-scoped server approval sözleşmesi ve bu işlem için ayrı kontroller bulunmuyor.

**Aktarım notu:** Config düzeyinde enable/disable ile bir sohbetin izin vermesi ayrı işlemler. Providerların desteklediği gerçek kapsamlarla uygulanmalı.

**Uygulama sonrası kontrol:** Bir sohbette verilen iznin diğerine geçmemesi; disabled serverın kullanılmaması; çalışmakta olan turn ve config değişimindeki davranışın açık olması.

<a id="f15"></a>
#### F15 Context maliyetini System Tools Messages olarak ayrıştırma

**Durum:** Bizde kısmen var. **Uyarlama:** Orta.

Context doluluğunun yanında hangi içerik veya araç şemasının ne kadar yer kapladığını ve tahmini maliyetini göstermek.

**Commitler:** [`11981c024b`](https://github.com/imnakul/monocode-clone/commit/11981c024be2f4e9db5e9a3f43e98a3f7fc7af4f) feat(context): accurate context breakdown for Claude and Codex, [`9414a1d30d`](https://github.com/imnakul/monocode-clone/commit/9414a1d30d8327add8ae003200f73bc0b097f4b2) feat(context): add itemized breakdown and diagnosis for System & Tools.

**Bizim kod:** ContextMeter.tsx/contextUsage.ts ve ProviderUsageSettings.tsx toplam context/kullanımı gösteriyor; kaynak System & Tools tanı ve itemized breakdown veri modeli farklı.

**Aktarım notu:** Ölçülen tokenla tahmini token UI içinde açık ayrılmalı. Bize ait MCP/skills/runtime promptlarının ek maliyeti hesaplamaya dahil edilmeli.

**Uygulama sonrası kontrol:** Claude/Codex gerçek kullanım ve tahmin ayrımı; model fiyatı yokken maliyet uydurmama; büyük tool schema ve context reset.

<a id="f16"></a>
#### F16 Uygulama içi FPS ve etkileşim performans kaydı

**Durum:** Bizde yok. **Uyarlama:** Küçük orta.

UI gecikmelerini geliştirme sırasında overlay ve kaydedilmiş perf loglarıyla ölçmek.

**Commitler:** [`4fae052c07`](https://github.com/imnakul/monocode-clone/commit/4fae052c072a04ffb847ba972664fa2545c755bb) Add a Performance overlay for FPS and hover-glide diagnostics, [`cbe08b26cb`](https://github.com/imnakul/monocode-clone/commit/cbe08b26cb15e13d68128c6dbb28b348205c45db) Add board counts, perf log recording, sliding panes and 2x2 board reflow.

**Bizim kod:** Bizde performans denetim dokümanları/testleri olabilir; bu uygulama içi FPS/hover diagnostics overlay bileşeni bulunmuyor.

**Aktarım notu:** Ürün akışına sürekli diagnostik gürültü eklememek için yalnız isteğe bağlı/geliştirici modunda çalıştırılmalı; ölçümün kendi yükü sınırlanmalı.

**Uygulama sonrası kontrol:** Overlay kapalıyken maliyetin kaybolması; birden çok pane ve terminalde ölçüm; perf çıktısında prompt/token/hesap sırrı bulunmaması.

### zaesho/monocode

<a id="f17"></a>
#### F17 Factory Droid sağlayıcısı ve host desteği

**Durum:** Bizde yok. **Uyarlama:** Orta büyük.

Droid CLI üzerinden canlı modeller, kullanım, izinler ve uzaktaki host oturumları.

**Commitler:** [`9662d82d24`](https://github.com/zaesho/monocode/commit/9662d82d2443242d381fbd59439aaeda9a2ea38b) Add Factory Droid ACP harness support, [`52dcc9cb6f`](https://github.com/zaesho/monocode/commit/52dcc9cb6f1e784364275637c1d65d53e4813d2b) Port Droid host and usage support with ACP lifecycle fixes, [`52243a47b6`](https://github.com/zaesho/monocode/commit/52243a47b6d2b4fe74ad4bf01078d17037da5a33) Fix Factory Droid ACP lifecycle and account state.

**Bizim kod:** HarnessId union, provider registry ve provider klasörlerinde Droid yok.

**Aktarım notu:** Tauri/React dalının commitleri seçilmeli; GPUI provider portu aynı kod değil. Hesap ve ACP lifecycle düzeltmeleri ilk sağlayıcı commitine eşlik etmeli.

**Uygulama sonrası kontrol:** Keşif, katalog, yeni/devam turn, tool approval, cancel ve kota; hostta aynı sağlayıcı; kurulu ve giriş yapılmış Droid CLI ile canlı deneme.

<a id="f18"></a>
#### F18 Sağlayıcılar arasında ortak skill kütüphanesi

**Durum:** Bizde kısmen var. **Uyarlama:** Orta büyük.

Skillleri merkezi olarak içe aktarmak, sağlayıcı/hesap aliaslarına dışa vermek ve durumlarını yenilemek.

**Commitler:** [`73d3f8a2c1`](https://github.com/zaesho/monocode/commit/73d3f8a2c172f143e440d9774d17ae97d4862ebb) Add shared skill management to Skills settings, [`b4f633f323`](https://github.com/zaesho/monocode/commit/b4f633f323b64aa2286f62b327b199375edd39f1) Fix shared skill startup and export edge cases, [`f04caa83d4`](https://github.com/zaesho/monocode/commit/f04caa83d45c3b39dfdce6147b4c7a20fbd832a2) Preserve shared skill imports and account aliases.

**Bizim kod:** Bizde SkillsPage.tsx, src-tauri/src/skills.rs ve mevcut dirty transferSkill.ts farklı makineler arasında aktarımı destekliyor. Kaynağın shared skill imports/exports ve provider/account alias yaşam döngüsü ayrı.

**Aktarım notu:** Bizde symlink ve root güvenlik kuralları var. Merkezi skill yönetimi bunları aşmadan ve var olan local/remote aktarımla birleşerek eklenmeli.

**Uygulama sonrası kontrol:** İki sağlayıcı ve iki hesap; içe/dışa aktarım, dış değişiklik, read-only hedef ve skill kaldırma; mevcut provider native commandlarının korunması.

<a id="f19"></a>
#### F19 Kuyruktaki mesajı kaydedildiği model ve effort ile gönderme

**Durum:** Bizde yok. **Uyarlama:** Orta.

Kuyruğa alındıktan sonra model değişse bile her mesajın o anda seçilmiş modelini kullanması.

**Commitler:** [`68e8279655`](https://github.com/zaesho/monocode/commit/68e8279655ded38882721898ea312ecec1b2651c) Continue sessions across providers with durable shared context, [`0a5ff028cf`](https://github.com/zaesho/monocode/commit/0a5ff028cf0a534cc38720efee7046547c6bf713) Keep queued messages on their saved model selection.

**Bizim kod:** src/features/sessions/model/session.ts QueuedMessage yalnız id/text/attachments/cards/intent tutuyor; model ve modelSettings alanları yok. queuePersistence.ts bu alanları kaydetmiyor.

**Aktarım notu:** Bizim restart sonrası bekletme, queue edit, steer ve remote queue davranışı korunmalı. Provider hesabı da sabitlenecekse ayrı karar gerekiyor.

**Uygulama sonrası kontrol:** A modelinde kuyruk, B modeline geçiş, restart, sıra değiştirme ve edit; mesajın A ve kendi effortuyla gönderilmesi.

<a id="f20"></a>
#### F20 GPUI ile tamamen yerel Rust arayüzü

**Durum:** Araştırma seçeneği. **Uyarlama:** Çok büyük.

Webview tabanlı uygulamaya alternatif yerel UI mimarisi; aynı forkta geniş bir port serisi var.

**Commitler:** [`8ecbadac83`](https://github.com/zaesho/monocode/commit/8ecbadac83245571e80b2b6bfa11a2b8f91fd90e) Add native workspace skeleton for the GPUI rebuild.

**Bizim kod:** Bizim uygulama Tauri/React. Kaynak GPUI workspace, engine ve view crate portları bizde yok.

**Aktarım notu:** Bu bir optimizasyon commitini cherry-pick etmek değil, alternatif ürün mimarisi. Benchmarksız daha hızlı olduğu söylenemez; mevcut fork dalı deneysel kabul edilmeli.

**Uygulama sonrası kontrol:** Önce ayrı prototipte bellek/CPU/ilk açılış ve erişilebilirlik ölçümleri; Windows, çoklu pencere, terminal ve tüm sağlayıcıların uçtan uca kapsamı.

### mstfmedeni/monocode

<a id="f21"></a>
#### F21 Claude Remote Control oturumunu UI ile aynalama

**Durum:** Bizde yok. **Uyarlama:** Büyük.

Claude Remote Control bağlantısını göstermek; PTY/transcript üzerinden uzaktan devam eden konuşmayı ve onayları uygulamaya yansıtmak.

**Commitler:** [`4cc45f3c41`](https://github.com/mstfmedeni/monocode/commit/4cc45f3c4188a833675fe7a056b32e3ece893bb0) Add the remote control setting, [`9692069a47`](https://github.com/mstfmedeni/monocode/commit/9692069a47987cd00997038346af9291162fef36) Offer remote control from the tab menu, [`2731265d24`](https://github.com/mstfmedeni/monocode/commit/2731265d2411a069fd71a1228bf618dccac6b477) Answer a remote session's prompts from MonoCode, [`aa44791d34`](https://github.com/mstfmedeni/monocode/commit/aa44791d3473ba7a72235c4fe8055ef1bb098119) Tail the transcript with a ranged read, [`1553836f9a`](https://github.com/mstfmedeni/monocode/commit/1553836f9a901d8e7087392522d46eb77a11ea96) Hold an approval back until two frames agree on its options.

**Bizim kod:** Bizde MonoCode Host uzaktan erişimi var. Claude native Remote Control PTY bridge, remoteControl ayarı ve mirror parserı bulunmuyor.

**Aktarım notu:** Kaynak CLI ekranındaki metni parse ediyor; CLI sürümüne ve terminal boyutuna duyarlı. İki frame doğrulaması ve ranged transcript read düzeltmeleri atlanmamalı. Igorun yaklaşımıyla alternatif, ikisini birden taşımak gerekmiyor.

**Uygulama sonrası kontrol:** Gerçek telefon/uzak Claude turn; approval seçenekleri, cancel, çok satırlı prompt, CLI çıkışı, büyük transcript ve turn sırası; yanlış onay göndermeme.

### Warexpor/monocode

<a id="f22"></a>
#### F22 Grok kurulum sihirbazı

**Durum:** Bizde yok. **Uyarlama:** Orta.

Grok Build kurulumunu, OpenCode Zen/Go ve Exa websearch bağlantılarını adımlı arayüzle hazırlamak.

**Commitler:** [`5e587256f2`](https://github.com/Warexpor/monocode/commit/5e587256f2310352ca375aaab64de7603cc16286) Add Grok Full Setup wizard with OpenCodex Zen/Go and Exa websearch., [`5164620d11`](https://github.com/Warexpor/monocode/commit/5164620d11b2f470c290406e53414891c05889dd) Polish Full Setup UX and clear dead code across the fork overlay..

**Bizim kod:** Bizde Grok sağlayıcısı var; Full Setup sihirbazı ve bu entegre onboarding akışı yok.

**Aktarım notu:** Sihirbazın yaptığı dosya/config değişimleri önceden görünür olmalı. Kaynak kişisel varsayılanlarını ve Groku varsayılan yapma kararını taşımamak gerekir.

**Uygulama sonrası kontrol:** Yeni/kurulu CLI, eksik hesap veya Exa anahtarı, yarım kalan kurulum ve yeniden başlatma; mevcut configlerin korunması.

<a id="f23"></a>
#### F23 Grok ACP rewind ve ek yönetim yüzeyleri

**Durum:** Bizde kısmen var. **Uyarlama:** Orta büyük.

Grok için turnü geri alıp düzenleyerek tekrar gönderme; Build ACP yüzeylerini uygulamada kullanma.

**Commitler:** [`fa5ae73f5d`](https://github.com/Warexpor/monocode/commit/fa5ae73f5d45d98f7348ef7456bb279523553095) feat: edit/resend and revert turns with Grok rewind, [`fb93f772a1`](https://github.com/Warexpor/monocode/commit/fb93f772a16a6e6c0496c6888da7eee61b2c19c0) feat(grok): host UI for Build harness ACP surfaces.

**Bizim kod:** Bizde genel edit/resend ve rewind harness sözleşmesi var. src/integrations/harness/providers/grok içinde rewindLastTurn uygulaması bulunmuyor; kaynak Grok ACP UI kapsamı daha geniş.

**Aktarım notu:** Genel transcript revert ile sağlayıcının gerçek conversation rewind sınırı farklı. Kaynak büyük commitinden yalnız gerekli parçalar port edilmeli.

**Uygulama sonrası kontrol:** Grok gerçek rewind, araç kullanan turn, değişen dosyaların checkpointi, başarısız rewind ve yeniden gönderme.

<a id="f24"></a>
#### F24 Tool aşamasını kapatırken içeriği animasyon bitene kadar tutma

**Durum:** Bizde kısmen var. **Uyarlama:** Küçük.

Fold kapanışında içeriğin hemen yok olması yüzünden oluşan görsel sıçramayı azaltmak.

**Commitler:** [`d5146ba217`](https://github.com/Warexpor/monocode/commit/d5146ba217a471b3fde61291f9ef83973888eb7b) Smooth tool-phase fold close by keeping steps mounted during collapse..

**Bizim kod:** AgentTranscript.tsx tool foldları içeriyor. Kaynak keeping-steps-mounted kapanış yaklaşımı ayrı bir UX düzenlemesi; bizim güncel fold bileşenine uyarlamak gerekir.

**Aktarım notu:** Transcript pool, dar pane ve scroll anchor davranışıyla ölçülmeli; kapalı tool içeriğinin sürekli DOMda kalması yeni bir bellek sorunu oluşturmamalı.

**Uygulama sonrası kontrol:** Uzun tool fazını aç/kapat, streaming sırasında fold, dar pane ve scroll anchor; kapanış sonrasında gereksiz mounted node kalmaması.

### Dreckiez/polycode

<a id="f25"></a>
#### F25 Diff syntax highlighting işini Web Worker içine taşıma

**Durum:** Bizde yok. **Uyarlama:** Orta.

Büyük diff tokenizasyonunu UI threadinden ayırarak tıklama ve scrollun işlem sırasında cevap verebilmesini sağlamak.

**Commitler:** [`2f1436db85`](https://github.com/Dreckiez/polycode/commit/2f1436db85864d6b80a850d1e2b90a1f33ce3077) perf: run syntax highlighting in a background worker.

**Bizim kod:** src/features/files/editor/syntaxTokens.ts highlightSource içinde EditorState/create ve highlightCode aynı threadde çalışıyor; syntaxTokens.worker.ts ve Worker çağrısı yok.

**Aktarım notu:** Kaynak tema presetine ve eski klasör düzenine bağlı. Worker request iptali, crash fallback, bounded pending map ve Tauri build/CSP kontrolü uyarlanmalı; hız artışı henüz ölçülmedi.

**Uygulama sonrası kontrol:** Büyük diff ve hızlı dosya/tema değişimi; eski cevabın ekrana basılmaması; worker crash fallback; UI long-task ve bellek ölçümü.

<a id="f26"></a>
#### F26 Dosya ağacında gerçek viewport sanallaştırması

**Durum:** Bizde kısmen var. **Uyarlama:** Orta büyük.

Ağaçta sadece viewport yakınındaki satırları mount etmek; çok açık klasörde DOM büyümesini sınırlamak.

**Commitler:** [`f7a277803a`](https://github.com/Dreckiez/polycode/commit/f7a277803ac55cba6f5fbc058b84f2d5e42d195a) perf: virtualize git history graph and file explorer rows.

**Bizim kod:** GitGraphList.tsx görünür aralık ve overscan ile zaten sanallaştırılıyor; o parça alınmayacak. fileTree.ts windowEntries ise klasör başına ilk N satırı gösteriyor, viewport temelli ağaç düzleştirmesi değil.

**Aktarım notu:** Selection, drag/drop, rename, keyboard navigation ve farklı satır yükseklikleri kaynak çözümünden daha kapsamlı mevcut davranışları etkiliyor.

**Uygulama sonrası kontrol:** 10 bin giriş, çok açık klasör, ok tuşları ve reveal, drag/drop, rename; viewport dışına kaydırınca node sayısının sabit sınıra yakın kalması.

<a id="f27"></a>
#### F27 Canlı token akışını blok düzeyinde ayrı storea ayırma

**Durum:** Bizde kısmen var. **Uyarlama:** Büyük.

Yeni token geldiğinde sadece ilgili assistant/reasoning metin bloğunu yenilemek.

**Commitler:** [`4c62d2b232`](https://github.com/Dreckiez/polycode/commit/4c62d2b23290dd9cd8dfd2d4fa9426f3c88fdb25) feat: isolate streaming chat text via chatStore.

**Bizim kod:** Bizde sessionsStore.ts ve App.tsx session/pane düzeyinde streaming izolasyonu zaten var. Kaynağın sessionId+blockId dar selectorı daha ince taneli; chatStore yok.

**Aktarım notu:** Commit arama/refactor değişikliklerini de içeriyor; tamamı alınmamalı. Bizim canonical state, persistence, steer/stop ve transcript pool ile flush sırası korunmalı.

**Uygulama sonrası kontrol:** Birden fazla stream, reasoning+text, stop/steer ve restart; metin kaybı/çift delta olmaması; React commit sayısının ölçülmesi.

<a id="f28"></a>
#### F28 Kaybolan CLI conversationını teşhis edip context ile devam

**Durum:** Bizde kısmen var. **Uyarlama:** Orta.

Sağlayıcı eski threadü bulamayınca kullanıcıya anlaşılır teşhis ve bağlamı koruyan yeni thread seçeneği sunmak.

**Commitler:** [`1d38880c31`](https://github.com/Dreckiez/polycode/commit/1d38880c310762317e65a279510abbe31f266322) feat(session): add CLI session loss diagnosis and continue with context flow.

**Bizim kod:** Bizde handoff.ts ve provider hata/recovery akışları var. Kaynaktaki session-loss diagnosis/disclosure ve özel continue-with-context akışı farklı.

**Aktarım notu:** CLI kayıp oturumu, auth hatası ve geçici bağlantı hatası birbirine karıştırılmamalı. Eski transcript korunmalı; task/host otomatik toparlanmasıyla çakışmamalı.

**Uygulama sonrası kontrol:** Silinmiş thread, yanlış hesap, normal ağ kesintisi; uygun durumda yeni conversation ve korunmuş bağlam; canlı provider doğrulaması.

### igortarasuk/monocode

<a id="f29"></a>
#### F29 Sprint takvimi haftalık plan ve saat takibi

**Durum:** Bizde yok. **Uyarlama:** Orta büyük.

Linear sprintlerini takvimde görmek, yerel çalışma saatlerini takip etmek ve haftalık plandan issue üretmek.

**Commitler:** [`3029e60d0e`](https://github.com/igortarasuk/monocode/commit/3029e60d0ef89e2699ac8a746be1432a322883f9) Sprint calendar with local hours in MonoCode, [`1d0834854c`](https://github.com/igortarasuk/monocode/commit/1d0834854ca2e3e39882aa65f1acf0a1cbff1cc8) Plan week and create issues from MonoCode.

**Bizim kod:** Bizde Inbox/tasks ve otomasyon var; src/features/planning ve planning.rs modülleri, CalendarView/SprintCalendar/TimePanel bulunmuyor.

**Aktarım notu:** Türkiye saat dilimi, gün sınırları ve issue oluşturmanın açık kullanıcı eylemi olması önemli. Tasks/Notes modeline bağımsız ikinci kayıt sistemi eklenmemeli.

**Uygulama sonrası kontrol:** Sprint tarihleri, Europe/Istanbul saatleri, haftalık saat değişimi ve issue oluşturma; gerçek Linear hesabıyla entegrasyon testi.

<a id="f30"></a>
#### F30 Teleport üzerinden SSH makinesi ekleme

**Durum:** Bizde yok. **Uyarlama:** Orta.

Teleport node listesinden uzak makine seçip mevcut bağlantı altyapısına eklemek.

**Commitler:** [`b3bdb671c5`](https://github.com/igortarasuk/monocode/commit/b3bdb671c51af4e50a3aec4683ab58d6150b8a41) Reach SSH machines through Teleport, [`58a4a8594e`](https://github.com/igortarasuk/monocode/commit/58a4a8594e7a84d7fb17d7d5c30229ba7a4bcc5b) Pick Teleport nodes when adding an SSH machine.

**Bizim kod:** Bizde remote.rs/remote_ssh.rs ve bağlantı yönetimi var; teleport.rs, tsh keşfi ve node picker bulunmuyor.

**Aktarım notu:** Teleport kullanıcı sertifikasının süresi ve yeniden giriş durumları mevcut SSH timeout/host yaşam döngüsüyle uyarlanmalı.

**Uygulama sonrası kontrol:** tsh yok, giriş süresi bitmiş, birden çok cluster/node; doğru node bağlantısı ve bağlantı kesilince toparlanma; gerçek Teleport ortamı.

<a id="f31"></a>
#### F31 Laya ve Ollama yönetimi ile otomasyona typed karar kapısı

**Durum:** Bizde yok. **Uyarlama:** Orta büyük.

Yerel modelleri ayarlardan yönetmek ve automation çalışmadan önce dar bir karar kontrolü yapmak.

**Commitler:** [`87aa201696`](https://github.com/igortarasuk/monocode/commit/87aa201696cae451684a578d86850681787bf625) Add Laya CLI and Ollama commands, [`5e0ac849ae`](https://github.com/igortarasuk/monocode/commit/5e0ac849aec8e62c7ba6d84a672e5dc12ef2b209) Add Laya settings card and Local models page, [`6e83ae43ea`](https://github.com/igortarasuk/monocode/commit/6e83ae43ead94840da635594946677f19ae6594d) Add Laya pre-check gate for automation runs, [`c7a74fde9b`](https://github.com/igortarasuk/monocode/commit/c7a74fde9b3d5b5ac79327ba4d6888511e98cb0b) Add Laya pre-check section to the automation form.

**Bizim kod:** Kullanıcının agent ortamında Laya MCPsi bulunabilir; bu MonoCode içindeki laya.rs/ollama.rs, Local models page ve automation gate bulunduğu anlamına gelmez. Bu uygulama modülleri yok.

**Aktarım notu:** Kullanıcının min_confidence=0.6 kuralı ve Laya advisor rolü korunmalı; güvenlik/izin kararını modele bırakmamak gerekir. Yerel inference PC yükü ayrıca ölçülmeli.

**Uygulama sonrası kontrol:** Confidence düşük/çelişkili sonuç, model yok, timeout ve çoklu automation; beklenmeyen skip/run olmaması; Türkçe değerlendirme.

<a id="f32"></a>
#### F32 Assistant profilleri ve cevapları etiketli to doya dönüştürme

**Durum:** Bizde kısmen var. **Uyarlama:** Orta.

Belirli assistantlarla sohbet başlatmak ve cevabı assistant etiketli yapılacak işe dönüştürmek.

**Commitler:** [`0a5138e22f`](https://github.com/igortarasuk/monocode/commit/0a5138e22f38acb6880ca2cd0165d688409e5702) Add assistants model and keep their folders off the rail, [`ca90f40a6a`](https://github.com/igortarasuk/monocode/commit/ca90f40a6a9155ba3cc2ab9606b3477aa5a45046) Add Assistants view and chat launch, [`6624e4b896`](https://github.com/igortarasuk/monocode/commit/6624e4b896db3518df30fc471bd236784eadaae2) Save agent replies as to-dos with assistant tags, [`028653522a`](https://github.com/igortarasuk/monocode/commit/028653522a8ba9bdbaa6096691d22317fdc86a09) Toggle to-do checkboxes and filter to-dos in Notes.

**Bizim kod:** Bizde Notes/Tasks ve cevapları notlara kaydetme var; özel Assistants view, assistants model ve assistant-tagged to-do filtre/checkbox akışı yok.

**Aktarım notu:** Bizim host tasks, goals ve steward kayıtlarıyla kullanıcı to-doları ayrılmalı; mevcut Notes Markdown korunmalı.

**Uygulama sonrası kontrol:** Assistant seçimi, cevap-to-do, checkbox ve filtre; not formatı, restart ve mevcut Tasks navigasyonuyla uyum.

### itizarsa/monocode

<a id="f33"></a>
#### F33 Claude usage isteğinde ANTHROPIC_BASE_URL desteği

**Durum:** Bizde yok. **Uyarlama:** Küçük orta.

Özel Anthropic gateway kullanan hesabın usage çağrısını uygun base URL üzerinden yönlendirmek.

**Commitler:** [`1776f14f04`](https://github.com/itizarsa/monocode/commit/1776f14f045b9e59e62fc8ebb72938c2d028736a) Honor ANTHROPIC_BASE_URL for Claude usage, [`704e82989e`](https://github.com/itizarsa/monocode/commit/704e82989ea51864e55959a7cbd1545e35d773bf) Test Claude usage base URL fallback and request routing.

**Bizim kod:** src-tauri/src/rate_limits.rs OAUTH_USAGE_URL sabit api.anthropic.com; fetch_claude_oauth_usage bu sabitle çağrı yapıyor.

**Aktarım notu:** OAuth tokenının yanlış hosta gitmesini önlemek için kaynak routing kuralları incelenmeli; her özel inference gatewayin usage API desteklediği varsayılmamalı.

**Uygulama sonrası kontrol:** Varsayılan endpoint, geçerli özel gateway, hatalı/boş base URL, doğru path birleştirme ve token hedefi; kontrollü mock endpointle test.

<a id="f34"></a>
#### F34 Büyüyen usage loglarını kaldığı offsetten okuma

**Durum:** Bizde kısmen var. **Uyarlama:** Orta.

Uzun yaşayan transcript dosyasına yeni kayıtlar eklendikçe dosyanın tamamını yeniden parse etmeyi azaltmak.

**Commitler:** [`d2afc818e1`](https://github.com/itizarsa/monocode/commit/d2afc818e18a20dda6581a04cf56f0f24bfbc1fa) Read usage logs incrementally and memoize the Usage section.

**Bizim kod:** Bizde provider_usage.rs path+size+mtime diskte cache ve stale-file ayrımı sağlıyor; değişen dosyaları yeniden parse ediyor. Kaynak incremental seek/offset ve UI memoization yaklaşımı daha ileri.

**Aktarım notu:** Log truncate/rotation, yarım JSON satırı, duplicate request ve account isolation mevcut cache formatıyla birlikte ele alınmalı.

**Uygulama sonrası kontrol:** Dosyaya append, truncate, rotate, bozuk/yarım satır; toplamların tam taramayla eşleşmesi ve sadece eklenen byte miktarının okunması.

## Zaten bizde bulunan ve yeni özellik olarak saymadıklarım

| Kaynaklarda görülen iş | Bizde doğrulanan karşılık |
| --- | --- |
| Windows/ConPTY ve helper console düzeltmeleri | `src-tauri/src/pty.rs`, mevcut harness child launch ve Windows süreç yönetimi |
| WebGL terminal renderer | `src/features/terminal/ui/TerminalView.tsx` görünürken WebGL yükleyip context loss halinde fallback yapıyor |
| Git history sanallaştırması | `GitGraphList.tsx`, `gitGraphWindow.ts`, overscan ve visible range |
| PDF görüntüleme | `src/features/files/ui/PdfViewer.tsx` |
| Kalıcı mesaj kuyruğu | `useQueuePersistence.ts`, `queuePersistence.ts`, `sessionStoreQueue.test.ts` |
| Markdown bidi desteği | `AgentMarkdown.tsx` dir auto ve `src/styles/index.css` block isolation |
| Düzenlenebilir kısayollar ve IME koruması | `ShortcutSettings.tsx`, `appShortcuts.ts`, ayar override/validatorları |
| CLI binary path override | `providerBinaryPaths.ts`; genel launch args/env paketi bundan ayrı |
| Agentların çalışırken sleep engeli | `useKeepAwake` App entegrasyonu; sleep engelini yeni özellik saymadım |
| GitLab ve Azure Boards/Repos | `gitlab.rs`, `azure_devops.rs`, Inbox modelleri; pipeline ek kapsamı ayrı |
| Operator sessions.wait | `src/features/agent-app/model/agentApp.ts` ve session tool projectionları |
| Uygulama reloadunda PTYyi canlı tutma | `pty.rs` owner/reattach/reaper sözleşmesi |
| Hesap bazlı kota ve token/maliyet Usage sayfası | `ProviderAccountUsage.tsx`, `ProviderUsageSettings.tsx`, `provider_usage.rs` |
| Kullanım limiti sıfırlanınca devam | session usageLimit.resumeAtReset, App drain ve RemoteSession handling |
| Yerel signed updater ve fork build kimliği | `docs/fork.md`, fork config ve release pipeline; başka forkların updaterı önerilmedi |

## İlk 10 dışında dikkate değer bağımsız adaylar

Bu ek liste ilk 10 sıralamasına dahil değildir. Özellikle küçük ama yararlı işlerin çok sayıda commit gerektirmemesi nedeniyle ayrıca kaydettim.

| Fork | Aday | Commitler | Bizim farkımız |
| --- | --- | --- | --- |
| [YuriPerro/monocode](https://github.com/YuriPerro/monocode) | Agent profilleri ve operator varsayılanı | [`107df8fddb`](https://github.com/YuriPerro/monocode/commit/107df8fddbc659cd690c9552526744cbcefe2ac8), [`9914ec9059`](https://github.com/YuriPerro/monocode/commit/9914ec9059d6ac99a2e1af93fbb8680101fa83ae), [`8d1977f19f`](https://github.com/YuriPerro/monocode/commit/8d1977f19fee1e1b3b68a8af8f6403a7fddc2ade) | Sıralamada 11. Bizde sessions.wait zaten var; onu yeni özellik olarak saymadım. Sistem promptu profilleri ayrı aday. |
| [felipe-jm/monocode](https://github.com/felipe-jm/monocode) | Idle recap ve manuel oturum başlığını koruma | [`6115af4060`](https://github.com/felipe-jm/monocode/commit/6115af40600fdacb38ee0b5b06c61aa23c772781), [`81d769e70a`](https://github.com/felipe-jm/monocode/commit/81d769e70a2eeab46c85efc85581e4b8bf8fb718) | 41 farklı yama. Bizde başlık üretimi var; idle recap satırı ve kullanıcı başlığı provenance modeli ayrı iyileştirme. |
| [SamuelPoiani/monocode](https://github.com/SamuelPoiani/monocode) | Birden çok repoda ortak orchestration ve git spawnsız keşif | [`fd251d2780`](https://github.com/SamuelPoiani/monocode/commit/fd251d2780346cafcfa65e25b57b253d5b6b252f), [`d14917b9d0`](https://github.com/SamuelPoiani/monocode/commit/d14917b9d05bfaf5c54687047aee0d1b67b6009f) | 22 farklı yama. Bizde linkedWorkspace grupları var; tüm orchestration/mention/nested repo akışı aynı kapsamda değil. |
| [dembicki/monocode](https://github.com/dembicki/monocode) | CodeMirror Vim modu | [`609a9549e1`](https://github.com/dembicki/monocode/commit/609a9549e1526a97303c3573b453ec58ba59f8f9) | 27 farklı yama. Bizde Vim extension ve ayarı yok; görece küçük ve bağımsız aday. |
| [wanyest/monocode-copilot](https://github.com/wanyest/monocode-copilot) | GitHub Copilot ve extended context | [`76d5fa85b5`](https://github.com/wanyest/monocode-copilot/commit/76d5fa85b5b902782651cc3d12e2861750b9b3d5), [`a4d92bbcf1`](https://github.com/wanyest/monocode-copilot/commit/a4d92bbcf1dd6c0b4717ee0b4e403b25875fa31d) | Merge hariç yalnız 6 farklı yama; ham ahead=32 yanıltıcı. Bizde Copilot providerı yok. |
| [kshitijsubedi/monocode](https://github.com/kshitijsubedi/monocode) | Provider launch args ve env overrides | [`a6b3158dc5`](https://github.com/kshitijsubedi/monocode/commit/a6b3158dc5b18d5fd784ae8664efd6c3194a5e18), [`c42b8e15ee`](https://github.com/kshitijsubedi/monocode/commit/c42b8e15ee621029f4c8d3e19e7fa04677b5c758) | 18 farklı yama. Bizde binary path override zaten var; genel launch args/env ayarları farklı. Tam serinin son düzeltmeleri de gerekli. |
| [AVMG20/monocode](https://github.com/AVMG20/monocode) | Composer üzerinde background task/subagent yönetimi | [`a6eef45c95`](https://github.com/AVMG20/monocode/commit/a6eef45c95ecb80393ec817594aa412677068123), [`de46a0279f`](https://github.com/AVMG20/monocode/commit/de46a0279f16302ef28b9e540866930fe10a337c) | 42 farklı yama. Bizde ComposerRunner/SubagentSheet var; görev başına stop ve swap görünümü ayrı UI alternatifi. |

## İmplementasyon kararı için kullanım

Bir veya birkaç F kodunu seçmek yeterli. Seçilen davranışın güncel branchteki son halini ve bağlı düzeltmeleri yeniden kontrol edip bizim modül düzenine port etmek daha uygun; bütün fork dalını merge etmek büyük ölçüde geriye gitmiş upstream, kişisel branding ve silinmiş özellikleri de taşır. Özellikle Polycode eski klasör düzeninde; GPUI ise farklı UI stackidir.

Her aday için tam SHA, changed-file listesi, commitin görüldüğü indirilen branch refleri ve mevcut HEAD ile patch/ancestor eşleşmesi `fork-research-2026-10-04.json` dosyasında kayıtlı. JSON ayrıca fork ve branch snapshotlarını içeriyor. Eşleşmeme tek başına özellik yok demek değildir; yukarıdaki Bizim kod alanları semantik karşılaştırmanın sonucudur.

## Doğrulama ve sınırlar

GitHub fork, branch ve compare verileri canlı okundu. Seçilen adayların commit diffleri indirildi; bütün ilk 10un Git geçmişi/branchleri yerel uygulama snapshotından ayrı geçici bare repoda incelendi. README ve commit başlığı tek başına özellik kanıtı olarak kullanılmadı. Provider kayıtları, komut modülleri, modeller ve ilgili frontend/backend kodları mevcut çalışma klasöründe kontrol edildi. Testler ve uygulama buildi çalıştırılmadı: bu araştırmada uygulama değişikliği yapılmadı, forkların testleri/CI ifadeleri bizim kabul sonucumuz sayılmadı.

Gerçek WSL dağıtımı, mikrofon, telefon Remote Control, Teleport, Droid, cloud account, Linear ve Azure Pipelines kabulü bu çalışma sırasında denenmedi. Statik kaynak varlığı bu ortamların çalıştığını kanıtlamaz. Özelliklerin bazıları default branchte değil; kaynak branch ve tüm commitler ileride değişebilir. İnceleme public fork ağıyla sınırlı.
