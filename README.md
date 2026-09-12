# Real / AI — 人還是 AI？

3–10 人即時派對遊戲：每人寫一句答案，混入一個真正的 DeepSeek 回答，匿名投票找出 AI。

## 遊戲

- 六位房間碼、分享連結、暱稱入場、刷新後重返。
- 每局六輪，30 秒作答，22–33 秒投票，12 秒揭曉。
- 找出 AI +2；每位朋友誤認你的答案為 AI，你 +1。
- AI 與玩家同時作答，每輪最多一次 API 呼叫。錯誤或逾時不使用假 AI 代替，該輪不計分。
- 3 人開局、最多 10 人；開局後不接受新玩家，已有玩家可以重返。
- 廣東話／中文語氣，最近八條匿名答案作語氣參考，最多保留十六條。

## 技術

React 19 / Vinext / Cloudflare Workers / D1 SQLite。後端以版本比較更新（CAS）處理多人同時操作；只有伺服器可見作者、AI 答案、身份憑證和未揭曉的投票。客户端每 1.8 秒同步，背景頁面每 6 秒同步；時間與計分由伺服器決定。房間建立六小時後到期，下次有人建立房間時清理過期資料。

模型：中國版 SiliconFlow，`deepseek-ai/DeepSeek-V4-Flash`，`enable_thinking: false`。模型名稱及端點可用環境變數切換。實際 API 費用由 SiliconFlow 計算；伺服器免費額度與 API 費用分開。

## 執行

需要 Node.js 22.13+（測試使用 node:sqlite，建議 Node 24）及 package.json 指定的 pnpm。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
# 在 .env 填入 SiliconFlow 金鑰，僅供本機伺服器使用
pnpm db:generate
pnpm dev
```

本機 D1 需先按照 `docs/runtime.md` 套用遷移；不在請求中建立資料表。

```bash
node --test tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm build
```

## 部署與密鑰

現有發佈由 Sites 管理 Cloudflare Worker / D1。`.openai/hosting.json` 綁定該網站，修改後必須建置及重新發佈；單純 push GitHub 不會自動更新既有網站。

獨立部署亦可使用 Cloudflare Workers 免費方案和 D1 免費額度，需要自己的 Cloudflare 帳戶。在產出的 `dist/server/wrangler.json` 中使用自己建立的 D1 database_id，套用 `drizzle/*.sql`，設定後端 secrets 後使用 Wrangler deploy。請勿把 Sites 管理的資源 ID 當作自己的 Cloudflare 資源使用。GitHub Pages 本身不能執行此遊戲後端。

環境設定：

| 名稱 | 用途 |
|---|---|
| DEEPSEEK_API_KEY | SiliconFlow 金鑰，必須以 secret 儲存，不能加 NEXT_PUBLIC 前綴 |
| AI_BASE_URL | https://api.siliconflow.cn/v1 |
| AI_MODEL | deepseek-ai/DeepSeek-V4-Flash |
| AI_DAILY_LIMIT | 預設全站每 24 小時最多 300 次生成嘗試，約 50 局 |
| CREATE_ROOM_PIN | 可選；設定後只有知道密碼的人能開房，加入只需房間碼 |

沒有模型的公開任意提示詞入口。內建開房、加入、動作及 AI 用量限制；公開大型營運需另外加入平台防濫用。玩家用瀏覽器保存隨機入場憑證；清除網站資料會失去原座位。遊戲中房主離線不影響自動回合，但再開一局需房主回來；也可由其他人開新房。

## 已驗證

- 四項純遊戲邏輯測試（10 人計分、身份隔離、逾時、六輪結束）。
- 實際 API handler 搭配 SQLite 測試：10 人同時加入／作答／投票、禁止第 11 人、自投、非房主開始、重複計分及未授權讀取。
- SiliconFlow 真實短回答呼叫成功、非思考 token 用量為零。此單次測試不代表所有地區的連線延遲。
- 本次未做實機瀏覽器或十部手機聯機測試；WebMCP 讀取介面有支援偵測，但未有可用環境驗證。

API 文件：[SiliconFlow](https://docs.siliconflow.cn/docs/api/chat-completions-post)。主機額度：[Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/)。
