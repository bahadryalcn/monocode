# Git Paneli Performans ve State Düzeltme Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Hedef:** Changes panelinde dosyaya tıklayınca diff'in anında açılması; stage / unstage / discard / commit / pull / push / sync aksiyonlarının hızlı çalışması ve her birinin görünür bir "çalışıyor" durumu olması.

**Durum (2026-10-02, uygulama sonrası):** Aşağıdakiler `main` üzerinde commit edilmemiş değişiklik olarak uygulandı. Testler geçiyor (web 5510, Rust git/fs 187); gerçek uygulamada elle denenmedi.

| | Önce | Sonra (ölçüldü) |
|---|---|---|
| Panel yenileme (`git_diff_index`) | ~900 ms, 14 süreç | ~77 ms, 1 süreç (değişiklik varsa 2) |
| Diff açılışı (git tarafı) | ~750–900 ms, 11 süreç | ~65 ms, 1 süreç |
| Branch listesi | 5 süreç | 1 süreç, ~61 ms |
| Aynı anda 4 istek | sık sık 5 sn takılma | ~290 ms, takılma yok |

- **Yapıldı:** Task 1, 2, 3, 5, 7 (debounce hariç), 9 (dosya bazlı `busy` hariç), 10 (Graph/Stash ilk yükleme göstergesi hariç), 11, 12, 13, 14 (branch listesi).
- **Plan dışı eklendi — T24:** Bu makinede aynı anda başlatılan iki süreçten biri, `main`'e girmeden önce tam ~5 sn bekliyor (`cmd /c exit` ile de oluyor; git'e özgü değil, çalışan güvenlik yazılımı: Windows Defender). Tek tek başlatınca oran ~%1, ikili başlatınca ~%12–30. Bu yüzden Task 4'teki "eşzamanlılık sınırı" yerine git süreçleri Windows'ta **tek tek başlatılıyor** (`GitSpawnGate`, `fs.rs`); paralel çalıştırma fikri geri alındı.
- **Yapılmadı:** Task 6 (ayrı store; backend ucuzlayınca gerek kalmadı, panel kendi çift tetiklemesini bırakıyor), Task 8 (poll 2 sn kaldı, artık 1 süreç), Task 15'teki kalıcı trace logu, `checkpoint.rs` / `search.rs` / `gitlab.rs` / `azure_devops.rs` içindeki doğrudan `Command::new("git")` çağrılarının kapıdan geçirilmesi, remote host tarafı.

**İlk inceleme notu:** Aşağıdaki tespitler kod okuması + bu makinedeki ölçümlerle doğrulandı; "doğrulanmadı" diye işaretlenenler hariç.

**Tech Stack:** Tauri (Rust, `src-tauri/src/fs.rs`), React 19, TypeScript, CodeMirror 6 (`@codemirror/merge`), Vitest.

## Global Constraints

- `git commit`, `git push`, branch, stash, worktree yok. Her şey `main` üzerinde commit edilmemiş değişiklik olarak kalır.
- Uygulama güncellenmez / kurulmaz (kullanıcı söylemeden).
- Her task `npx vitest run <paths>` ile, Rust tarafı `cargo test -p <crate> git_` ile doğrulanır; sonda `npm run check:web` ve `cargo clippy`.
- Remote (SSH host) projelerin davranışı bozulmamalı: `host/` altındaki karşılıklar bu planın kapsamı dışında, ama `GitDiffIndex` şekli değişmemeli.

---

## 1. Ölçümler (bu makine, bu repo: 1410 dosya, 32 çekirdek, git 2.51.1)

| Ölçüm | Süre |
|---|---|
| Tek `git` süreci (`C:\Program Files\Git\cmd\git.exe`, PATH'teki) | ~60–70 ms |
| Aynı komut, `mingw64\bin\git.exe` doğrudan | ~30–45 ms |
| `git_diff_index` eşdeğeri (14 ardışık süreç) | **~900 ms** |
| Aynı bilgiyi veren tek `git status --porcelain=v2 --branch -z` | **~70 ms** |
| Diff açma yolu (`gitDiffFiles` + `gitFileDiff`, 11 süreç) | **~750–900 ms** |

Sonuç: yavaşlığın ana kaynağı git'in kendisi değil, **Windows'ta süreç başlatma maliyeti × gereksiz çok sayıda süreç**. Repo küçük olduğu halde tek bir panel yenilemesi ~0,9 sn sürüyor ve bu yenileme 2 saniyede bir tekrarlanıyor.

---

## 2. Tespitler

### P0 — Asıl yavaşlık

**T1. `git_diff_index` tek çağrıda ~14 süreç başlatıyor** — `src-tauri/src/fs.rs:2306` (`git_diff_index_with`)
`diff --numstat`, `diff --name-status`, `ls-files -o`, `diff --cached --name-only`, `diff --name-only` (`mark_cached_and_unstaged`, `fs.rs:2551`), `ls-files -u`, sonra `git_sync_for` (`fs.rs:5603`): `remote`, `rev-parse @{upstream}`, `symbolic-ref origin/HEAD`, 2× `rev-list --count`, `for-each-ref --contains HEAD`; en sonda `symbolic-ref HEAD`, `rev-parse HEAD`. Hepsi ardışık. Dosya listesi + staged/unstaged + branch + upstream + ahead/behind tek `git status --porcelain=v2 --branch -z` ile gelir.

**T2. Bu çağrı 2 saniyede bir poll ediliyor** — `GitChangesPanel.tsx:111` (`GIT_POLL_MS = 2000`), `:1788`
~900 ms'lik iş 2 sn'de bir çalışıyor: panel açıkken zamanın ~%45'inde arka planda git süreçleri dönüyor ve kullanıcı aksiyonlarıyla yarışıyor.

**T3. `notifyGitChanged` global ve cwd'siz; her mutasyon bir yenileme fırtınası başlatıyor** — `src/platform/tauri/fs.ts:714`
Tek bir stage tıklamasında tetiklenenler (hepsi aynı anda, hepsi ayrı süreçler):
- `useDiffIndex` (panel) → `gitDiffIndex` (14 süreç)
- `useGitFileStatuses` → **ayrı** bir `gitDiffIndex` daha (kendi cache'i var, panelle paylaşmıyor) — `useGitFileStatuses.ts:107`
- `useProjectDiffStats` → rail'de görünen **her proje** için `gitDiffStats` (4–5 süreç/proje), olay hangi repoya ait olursa olsun — `useProjectDiffStats.ts:102`
- `useGitHistory` → `git log` 200 commit + 3–5 ek süreç — `GitHistoryGraph.tsx:408`
- `GitStashSection` → `stash list` — `GitStashSection.tsx:65`
- `useProjectBranches` (App'te 2 ayrı kullanım + menü) → her biri 5 süreç — `useProjectBranches.ts:102`
- `useProjectWorktrees`, `useLegacyConflictStatus`, `SessionReview`
- Açık her `FileEditor`: `gitDiffFiles` + `gitFileDiff` (11 süreç) + blame + `gitConflicts` — `FileEditor.tsx:345, 896, 1143`
- `WorkingTreeDiff`: `gitDiffFiles` + **tüm** dosyaların diff'i yeniden — `WorkingTreeDiff.tsx:142`

**T4. Fırtına iki kez çalışıyor** — `GitChangesPanel.tsx:191-196` ve `:1761-1765`
`onMutated` hem `reload()` hem `notifyGitChanged()` çağırıyor; `reload()` nonce'u artırıp effect'i yeniden kurduğu için eski effect'in başlattığı `gitDiffIndex` çöpe gidiyor. Yeni index farklı çıkınca `useDiffIndex` **tekrar** `notifyGitChanged()` atıyor → T3'teki her şey ikinci kez çalışıyor. Bir stage tıklaması kabaca 80–150 git süreci demek.

**T5. Diff açılışı: önce düz editör, sonra bölünme** — `FileEditor.tsx:285-355`, `:668-669`, `:1099`
- Dosya `readTextFile` ile gelince editör düz olarak çiziliyor (`gitBase = null`).
- Sonra ardışık: `gitDiffFiles(cwd)` (~8 süreç, sırf dosyanın staged mi unstaged mı olduğunu bulmak için) → `gitFileDiff` (`rev-parse --is-inside-work-tree`, `rev-parse --show-prefix`, `cat-file`) ≈ 750–900 ms.
- Halbuki Changes paneli `kind`'ı zaten biliyor ve tab'a `changeKind` olarak yazıyor (`App.tsx:3782`, `layout.ts:153`), ama `FilePane.tsx:220-238` bunu `FileEditor`'a **geçirmiyor**.
- `gitOriginal` gelince `splitDiff` `false → true` oluyor; bu, editör effect'inin dependency'si (`:1099`) olduğu için `EditorView` **yıkılıp** `MergeView` olarak baştan kuruluyor. Kullanıcının gördüğü "sayfa ikiye bölünüyor" anı bu.
- Yükleme sırasında diff'in geleceğine dair hiçbir gösterge yok.

**T6. `cmd\git.exe` sarmalayıcısı her çağrıyı ikiye katlıyor** — `fs.rs:4726` (`Command::new("git")`)
PATH'teki `Git\cmd\git.exe`, gerçek `mingw64\bin\git.exe`'yi başlatan bir sarmalayıcı: ~65 ms vs ~35 ms. Gerçek binary bir kez çözülüp cache'lenirse **her** git çağrısı ~%45 hızlanır.

### P1 — State ve geri bildirim eksikleri

**T7. Stage/unstage/discard'da görünür loading yok** — `GitChangesPanel.tsx:515-542`, `ChangeRow` `:1566`
`busy` sadece o satırın butonlarını `disabled` yapıyor; butonlar da yalnızca hover'da görünüyor. Spinner yok. Üstelik `busy`, git komutu biter bitmez (`finally`) temizleniyor ama liste ~1 sn sonra (index yenilenince) güncelleniyor: arada satır eski yerinde, hiçbir gösterge olmadan duruyor.

**T8. Optimistic update yok**
Stage sonucu belli (dosya Changes → Staged) olduğu halde UI, tam index yenilemesini bekliyor.

**T9. Commit butonunda loading yok** — `GitChangesPanel.tsx:804-816`
`busy === "commit"` iken buton sadece soluklaşıyor (`canCommit` false). "Committing…" yazısı / spinner yok. Commit & Push'ta push bitene kadar (saniyeler) hiçbir şey görünmüyor.

**T10. Pull / Push / Fetch / Sync göstergesi çok zayıf** — `GitActionsMenu.tsx:197-208, 547`
Tek gösterge başlıktaki 14 px'lik "…" butonunun spinner'a dönmesi; hangi işlemin sürdüğü yazmıyor. `status` metni sadece **bittikten sonra** ("Pull complete") çıkıyor. `GitOperationBanner` (Continue/Abort) ve `GitStashSection` (Apply/Pop/Drop) butonlarında da sadece `disabled` var.

**T11. İlk yüklemede ve yenilemede gösterge yok**
"Loading changes…" sadece index hiç yokken görünüyor (`:915`). Cache'li index varken arka plandaki yenileme görünmez; kullanıcı listenin güncel olup olmadığını bilemiyor. Graph ve Stash bölümlerinde hiç loading durumu yok (boş liste = yükleniyor mu, yok mu belirsiz).

**T12. Hatalar `window.alert` ile gösteriliyor** — `GitChangesPanel.tsx:491`
Webview'i bloklayan, uygulama diliyle uyumsuz kutu. Diğer yerler `plugin-dialog` `message` kullanıyor; tutarsız.

**T13. Uzun süren ağ komutlarında timeout / iptal yok** — `fs.rs:4748` (`git_checked`)
`push`/`pull`/`fetch` `.output()` ile süresiz bekliyor. Kimlik doğrulama takılırsa `busy` sonsuza kadar set kalıyor ve panelin tamamı kilitleniyor (`busy` tüm aksiyonları kapatıyor).

**T14. Aynı checkout'ta eşzamanlı git süreçleri sınırsız**
Her Tauri komutu ayrı `spawn_blocking`. Poll + fırtına + kullanıcı aksiyonu aynı anda onlarca süreç başlatabiliyor; okuma komutları `GIT_OPTIONAL_LOCKS=0` ile kilitsiz ama CPU/disk ve Defender taramasında yarışıyorlar. Kullanıcının `git add`'i bu kuyruğun arkasında kalıyor.

### P2 — Daha küçük verimsizlikler

**T15.** `git_diff_stats_for` (`fs.rs:2248`) 4–5 süreç; `git status` tek çağrısından türetilebilir. Rail'deki her proje için ayrı çalışıyor.
**T16.** `git_branches_for` (`fs.rs:4935`) 5 süreç; tek `for-each-ref refs/heads refs/remotes` + `%(HEAD)` yeter.
**T17.** `git_stage_all_for` (`fs.rs:2957`) önce `ls-files -u`; `git_discard_all_for` (`fs.rs:3073`) önce tam `git_diff_index_for` (sync dahil, 14 süreç) çalıştırıp sonra **dosya başına** 2 süreç başlatıyor. 50 dosyalık discard ≈ 100+ süreç.
**T18.** `git_commit_args` (`fs.rs:3117`) commit öncesi `ls-files -u`; `commit()` ayrıca `gitHeadMessage` çağırabiliyor. Küçük ama ardışık.
**T19.** `WorkingTreeDiff` her git olayında `setDiffs(new Map())` ile tüm diff'leri sıfırlayıp hepsini yeniden yüklüyor (`:75`) — tek dosya stage edince bütün liste "Loading…"a dönüp titriyor. Dosya başına `gitFileDiff` 3–4 süreç.
**T20.** `for-each-ref --contains HEAD refs/remotes` (`fs.rs:5623`) çok remote branch'li repolarda pahalı; her 2 sn'de çalışıyor. `headPushed` sadece amend/undo uyarısı için gerekli.
**T21.** Ajan çalışırken her tamamlanan tool çağrısı `notifyGitChanged()` atıyor (`App.tsx:12044, 12069`) → T3 fırtınası ajan akışı boyunca sürekli tetikleniyor. Debounce yok.
**T22.** `core.fsmonitor` / `core.untrackedCache` kapalı. Büyük repolarda `git status` süresini belirgin düşürür; uygulama bunu önermiyor/ayarlamıyor. (Bu repoda etkisi küçük; büyük repoda ölçülmeli — **doğrulanmadı**.)
**T23.** `push`/`pull`/`fetch`/`commit` için `gui_search_path()` her çağrıda hesaplanıyor (`fs.rs:4739`); Windows'ta login shell okuması yapıp yapmadığı ve cache'li olup olmadığı **doğrulanmadı**.

---

## 3. Plan

Sıra önemli: Faz 1 tek başına hissedilen yavaşlığın büyük kısmını çözer; Faz 2 "ne oluyor belli değil" sorununu; Faz 3 diff açılışını.

### Faz 1 — Backend: süreç sayısını düşür

#### Task 1: Gerçek git binary'sini çöz ve cache'le (T6)
**Files:** `src-tauri/src/fs.rs` (`git_cmd`, `:4726`)
- [ ] Windows'ta `git --exec-path` (veya PATH'teki `cmd\git.exe`'nin yanındaki `..\mingw64\bin\git.exe`) ile gerçek binary'yi bir kez çöz, `OnceLock<PathBuf>`'ta tut; bulunamazsa `"git"`'e düş.
- [ ] macOS/Linux davranışı değişmez.
- [ ] Test: çözümleyici fonksiyonu saf (path girdi → path çıktı) yaz, birim testi ekle.
- [ ] Doğrulama: aynı ölçüm betiğiyle tek çağrı ~65 ms → ~35 ms.

#### Task 2: `git_diff_index`'i `git status --porcelain=v2` üzerine kur (T1, T15, T20)
**Files:** `src-tauri/src/fs.rs` (`git_diff_index_with` `:2306`, `git_diff_stats_for` `:2248`, `git_sync_for` `:5603`), testler aynı dosyada
- [ ] `parse_status_v2(text) -> StatusSnapshot` yaz: `# branch.oid/head/upstream/ab` başlıkları, `1`/`2` (staged XY), `u` (unmerged), `?` (untracked) satırları. Saf fonksiyon, önce testleri yaz (rename, boşluklu path, detached HEAD, upstream'siz branch, ilk commit'siz repo, conflict türleri).
- [ ] `git_diff_index_with`: `status` (1 süreç) + satır sayıları için `diff --numstat HEAD` (1 süreç) + untracked satır sayımı (mevcut `text_line_count`). `name-status`, 2× `name-only`, `ls-files -o`, `ls-files -u`, `symbolic-ref`, `rev-parse HEAD`, `rev-parse @{upstream}`, upstream `rev-list` kalkar.
- [ ] `default_branch`, `ahead_of_default`, `head_pushed`: HEAD sha + remote ref'ler değişmediği sürece değişmez. `(root, head_oid, upstream_oid)` anahtarlı kısa bir cache'e al; poll'da yeniden hesaplanmasın.
- [ ] `git_diff_stats_for` aynı snapshot'tan türesin.
- [ ] `GitDiffIndex` JSON şekli **aynı** kalır (remote host uyumu). Mevcut Rust testleri geçmeli.
- [ ] Doğrulama: `git_diff_index` ~900 ms → hedef < 150 ms (2–3 süreç).

#### Task 3: `git_file_diff` ve toplu işlemleri sadeleştir (T5, T17, T19)
**Files:** `src-tauri/src/fs.rs` (`git_file_diff_for` `:2591`, `git_discard_all_for` `:3073`, `git_stage_all_for` `:2957`)
- [ ] `git_file_diff_for`: `is-inside-work-tree` + `show-prefix` iki süreci tek `rev-parse --is-inside-work-tree --show-prefix` yap; staged için `HEAD:` ve `:` blob'larını tek `cat-file --batch` ile al.
- [ ] `git_discard_all_for`: dosya başına süreç yerine tracked'ler için tek `git restore --worktree -- <paths>` (chunk'lı), untracked'ler için `std::fs::remove_file`; dosya listesi için `git_diff_files_for` (sync'siz).
- [ ] Testler: mevcut discard/stage-all testleri + çok dosyalı senaryo.

#### Task 4: Repo başına git süreç sınırı ve öncelik (T14)
**Files:** `src-tauri/src/fs.rs`
- [ ] Root başına küçük bir semafor (ör. okuma için 4 eşzamanlı). Yazma komutları (`add`, `restore`, `commit`, `push`…) semaforu atlar ya da ayrı öncelikli şerit kullanır, böylece kullanıcının aksiyonu poll'un arkasında beklemez.
- [ ] Aynı root için aynı anda ikinci bir `git_diff_index` isteği gelirse süren isteğin sonucunu paylaş (in-flight dedupe).

#### Task 5: Ağ komutlarına timeout (T13)
**Files:** `src-tauri/src/fs.rs` (`git_checked` `:4748`)
- [ ] `push`/`pull`/`fetch` için süre sınırı (ör. 120 sn) ve aşılınca süreci öldürüp anlaşılır hata döndür. Diğer komutlar değişmez.
- [ ] (Opsiyonel, ayrı karar) iptal butonu için komut id'si + `git_cancel`.

### Faz 2 — Frontend: tek kaynak, hedefli yenileme, görünür durum

#### Task 6: Paylaşılan repo-status store (T3, T4)
**Files:** yeni `src/features/source-control/model/repoStatusStore.ts` (+ test); `GitChangesPanel.tsx` (`useDiffIndex` `:1709`), `useGitFileStatuses.ts`, `useProjectDiffStats.ts`, `FileEditor.tsx:302`
- [ ] cwd anahtarlı tek store: `index`, `loading`, `refreshing`, `error`, `loadedAt`; in-flight dedupe; `useSyncExternalStore` ile abone olunur. Desen olarak mevcut `useProjectDiffStats.ts` entry yapısı örnek alınır.
- [ ] `useDiffIndex`, `useGitFileStatuses`, `useProjectDiffStats` (aktif proje için) ve `FileEditor`'ın `gitDiffFiles` çağrısı bu store'dan okur → aynı repo için tek `gitDiffIndex`.
- [ ] `onMutated` içindeki çift tetiklemeyi kaldır: mutasyon → store'a tek `refresh(cwd)`; `useDiffIndex` içindeki ikinci `notifyGitChanged()` (`:1764`) kalkar, bağımlılar store değişimine abone olur.

#### Task 7: `notifyGitChanged`'ı cwd'li ve debounce'lu yap (T3, T21)
**Files:** `src/platform/tauri/fs.ts:711-721` ve tüm çağıranlar (≈30 yer; `Grep notifyGitChanged`)
- [ ] `notifyGitChanged(cwd?: string, scope?: "index" | "refs" | "all")`; `subscribeGitChanged(listener, cwd?)`. cwd verilmezse eski davranış (geriye uyum), verilirse sadece o repoya abone olanlar tetiklenir.
- [ ] `scope`: stage/unstage/discard → `"index"` (history, branches, stash, worktrees **yenilenmez**); commit/checkout/pull/push/fetch → `"refs"`/`"all"`.
- [ ] Olayları ~100 ms trailing debounce ile birleştir (ajan tool fırtınası için, `App.tsx:12044, 12069`).
- [ ] `useProjectDiffStats`: başka repoya ait olayda yeniden yükleme yapmasın.

#### Task 8: Poll'u hafiflet (T2)
**Files:** `GitChangesPanel.tsx:111, 1788`
- [ ] Task 2 sonrası poll ucuz; yine de aralığı 2 sn → 5 sn yap, pencere odakta değilken durdur, kullanıcı aksiyonu sürerken (`busy`) atla.
- [ ] (Sonraki adım, ayrı karar) `.git/index` + `.git/HEAD` için dosya izleyici ile poll'u tamamen kaldırmak.

#### Task 9: Optimistic stage/unstage/discard + satır spinner'ı (T7, T8)
**Files:** `GitChangesPanel.tsx` (`run` `:515`, `runAll` `:544`, `ChangeRow` `:1566`), store
- [ ] Saf fonksiyon `applyOptimistic(index, action, relative)` (+ test): stage → `staged=true, unstaged=false`; unstage → tersi; discard → dosyayı listeden çıkar. Tıklamada store'a hemen uygulanır, git komutu arka planda çalışır, hata olursa geri alınır + hata gösterilir.
- [ ] Bekleyen satırda aksiyon butonunun yerine her zaman görünür `Loader` spinner (hover'a bağlı değil); satır `opacity-60`.
- [ ] `busy` tek string yerine `Set<string>` (dosya bazlı) olsun: bir dosya stage edilirken başka dosyaya tıklamak engellenmesin; git yazma komutları backend'de sıraya girer (Task 4).
- [ ] Stage All / Unstage All / Discard All: bölüm başlığındaki ikon spinner'a döner.

#### Task 10: Commit / Sync / Pull / Push / Fetch durumları (T9, T10, T11, T12)
**Files:** `GitChangesPanel.tsx` (`:804`, `GitSyncActions` `:1111`, başlık `:235`), `GitActionsMenu.tsx:197`, `GitOperationBanner.tsx`, `GitStashSection.tsx`
- [ ] Commit butonu: `busy === "commit"` iken spinner + "Committing…"; Commit & Push'ta aşama metni ("Committing…" → "Pushing…").
- [ ] `run(work, status)` imzasına `pendingLabel` ekle; başlıktaki `status` alanında işlem **sürerken** spinner + "Pulling…", "Pushing…", "Fetching…", "Syncing…" göster, bitince mevcut "… complete".
- [ ] Banner (Continue/Abort) ve Stash (Apply/Pop/Drop/Stash) butonlarında tıklanan butonda spinner.
- [ ] Store'daki `refreshing` için başlıkta ince, dikkat dağıtmayan bir gösterge (ör. branch adının yanında küçük spinner, 300 ms'den uzun sürerse görünür).
- [ ] Graph ve Stash için ilk yükleme durumu ("Loading…") ile "boş" durumunu ayır.
- [ ] `window.alert` (`:491`) → `message(..., { kind: "error" })` (diğer bileşenlerle aynı).

### Faz 3 — Diff açılışı

#### Task 11: `changeKind`'ı editöre geçir, gereksiz `gitDiffFiles`'ı kaldır (T5)
**Files:** `src/features/files/ui/FilePane.tsx:220`, `FileEditor.tsx:151-191, 285-355`
- [ ] `FilePane` → `<FileEditor changeKind={file.changeKind} />`.
- [ ] `FileEditor`: `changeKind` varsa doğrudan `gitFileDiff(cwd, relative, changeKind)`; yoksa store'daki index'ten (Task 6) oku. Ağ/süreç çağrısı olarak `gitDiffFiles` kalkar.
- [ ] `readTextFile` ile `gitFileDiff` **paralel** başlasın (şu an diff, dosya geldikten sonraki effect'te başlıyor).
- [ ] `eolOnly` hesabı için gereken `staged/unstaged` bilgisi store'dan gelir.
- [ ] Test: `FileEditorSplitDiff.test.ts`, `FileEditorCrlfGit.test.ts` güncellenir; `gitDiffFiles` çağrılmadığı doğrulanır.

#### Task 12: Düz editör → split yeniden kurulumunu önle (T5)
**Files:** `FileEditor.tsx:460-466, 668-669, 1099`
- [ ] `showDiff` true ve `gitBase` henüz yüklenmemişken düz editörü **çizme**: mevcut "Opening {dosya}…" yer tutucusunu diff gelene kadar tut (Task 1–3 + 11 sonrası hedef < 100 ms, o yüzden yer tutucu 150 ms gecikmeli görünsün ki titreme olmasın).
- [ ] Böylece `MergeView` ilk seferde kurulur; `EditorView` yık-kur adımı ve görünür "bölünme" kalkar.
- [ ] Diff yüklenemezse (binary / too large / hata) düz editöre düş (mevcut davranış).
- [ ] Önceki dosyadan sonrakine geçerken bayat `gitBase` gösterilmediğini doğrula (`gitBase.path === path` kontrolü `:357` korunur).

#### Task 13: `WorkingTreeDiff` artımlı yenileme (T19)
**Files:** `src/features/source-control/ui/WorkingTreeDiff.tsx:57-155`
- [ ] Git olayında `setDiffs(new Map())` yapma; dosya listesini store'dan al, sadece `additions/deletions/status/staged/unstaged` değişen girişlerin diff'ini yeniden yükle, kaybolanları sil.
- [ ] Test: tek dosya stage edilince diğerlerinin "Loading…"a dönmediği.

### Faz 4 — Küçük işler ve doğrulama

#### Task 14: Kalan verimsizlikler (T16, T18, T22, T23)
- [ ] `git_branches_for`: tek `for-each-ref` çağrısı.
- [ ] `git_commit_args`: `ls-files -u` ön kontrolünü kaldırıp git'in kendi hatasını `unmerged_message` ile eşle (ya da store'daki conflict bilgisini kullan).
- [ ] `gui_search_path()` Windows'ta ne kadar sürüyor ölç; pahalıysa `OnceLock` ile cache'le.
- [ ] Büyük bir repoda (> 50k dosya) `core.fsmonitor` / `core.untrackedCache` etkisini ölç; anlamlıysa Ayarlar'a öneri olarak ekle (otomatik config değiştirme yok).

#### Task 15: Ölçüm ve regresyon koruması
- [ ] Debug build'de her Tauri git komutu için süre + süreç sayısı logu (`MONOCODE_GIT_TRACE=1`).
- [ ] Önce/sonra tablosu: panel yenileme, stage tıklaması → UI güncellemesi, diff açılışı, stage sonrası toplam süreç sayısı. Hedefler:

| Senaryo | Şimdi | Hedef |
|---|---|---|
| Panel yenileme (`git_diff_index`) | ~900 ms | < 150 ms |
| Stage tıklaması → satır yer değiştirir | ~1–2 sn, göstergesiz | anında (optimistic) |
| Stage başına git süreci | ~80–150 | < 10 |
| Changes'ten dosya → diff görünür | ~0,8–1 sn, iki aşamalı | < 150 ms, tek aşama |
| Commit / push / pull | göstergesiz | her aşamada etiketli spinner |

- [ ] `npm run check:web`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test`.
- [ ] Elle test: staged+unstaged aynı dosya, untracked, silinmiş dosya, conflict'li merge, upstream'siz branch, detached HEAD, remote (SSH) proje, CRLF dosya, binary dosya.

---

## 4. Açık kararlar

1. **Poll yerine dosya izleyici** (Task 8, ikinci madde): daha temiz ama remote projelerde poll yine gerekir. Öneri: önce poll'u ucuzlat, izleyiciyi sonraya bırak.
2. **İptal butonu** (Task 5): pull/push için iptal istiyor musun, yoksa timeout yeterli mi?
3. **Dosya bazlı `busy`** (Task 9): aynı anda birden çok dosya stage edilebilsin mi, yoksa tek aksiyon kuralı kalsın ama görünür spinner mı yeterli?
4. **Remote host** (`host/git-actions.ts` ve ilgili dosyalar): aynı süreç-sayısı sorunu büyük ihtimalle orada da var (SSH üzerinden daha da pahalı) — **incelenmedi**; ayrı bir plan olarak ele alınmalı.
