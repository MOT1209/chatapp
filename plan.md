# خطة العمل المتبقية — Chat App Frontend

حالة المستودع الآن: **الواجهة الأساسية مكتملة وتُبنى بنجاح** (`tsc` نظيف، `vite build` ينجح).
المتبقي هو الاختبار، وضبط الجودة، وربطها بالـ backend.

آخر تحديث: بعد commit النشر الأول.

---

## 1. ما تم إنجازه بالفعل

| المجال | الحالة |
| --- | --- |
| المستودع | repo مستقل داخل `chatapps/` + `README.md` + `docs/api-contract.md` |
| Stack | React 19.3 · TS 5.9 · Vite 8.3 · Tailwind 4.3 · TanStack Query · React Router 7 · Zod · Zustand |
| نظام التصميم | tokens في `@theme inline`، خط Cairo، RTL كامل، light/dark/system |
| طبقة `lib` | `types` · `api-client` (refresh تلقائي) · `api` (endpoint واحد لكل route) · `socket` (WS + backoff + heartbeat) · `format` · `token-store` · `form-errors` |
| المصادقة | Login · Register · Forgot Password · حراسة المسارات · bootstrap للجلسة |
| التخطيط | 3 مقاسات مختلفة فعلياً: mobile شاشة واحدة · tablet عمودان · desktop ثلاثة أعمدة |
| المحادثات | قائمة جانبية · بحث debounce · محادثة جديدة idempotent · sidebar/profile |
| الرسائل | قائمة · فقاعات مجمّعة · فواصل أيام · input (Enter/Shift+Enter) · حالة pending/sent/read/failed + إعادة إرسال |
| Realtime | typing · presence · read receipts · إعادة اتصال · مؤشر انقطاع |
| الملف الشخصي | عرض · تعديل · حالة الاتصال · خروج بتأكيد |

**تحقق:** `npx tsc -b --noEmit` يمر · `npx vite build` ينجح (565 kB → 175 kB gzip).

---

## 2. ملاحظات على مخطط الـ backend (Phase 0)

قرأتُ `backend/prisma/schema.prisma` بعد أن دفعه المطور الآخر. متوافق مع الـ contract في الجوهري، وخصوصاً:

- `Message.clientId` مع `@@unique([conversationId, clientId])` ← يطابق شرط الـ idempotency الذي طلبته
- `Session.refreshHash` + `revokedAt` ← يدعم تدوير وإبطال الـ refresh token
- `Conversation.type = "direct"` مع تعليق أن `group` محجوز لاحقاً ← يطابق `ConversationType` عندي
- `ConversationMember.lastReadAt` ← أساس صحيح لحالة القراءة

**نقطتان يحتاجان تأكيداً من المطور الآخر** ( ليستا عيوباً، لكنهما استنتاجات يجب اتفقنا عليها):

1. **`User.status` (نص) مقابل `isOnline` (boolean) في الـ contract.**
   المقترح: `isOnline = (status === "online")` عند بناء الـ response. الواجهة تتعامل مع `isOnline` فقط.

2. **`Message` لا يحتوي `readAt` ولا `status`** — state القراءة مُشتقّة من `ConversationMember.lastReadAt`.
   المقترح: `readAt = lastReadAt` عندما `lastReadAt > message.createdAt`، وإلا `null`؛ و`status = readAt ? "read" : "sent"`.
   الواجهة تعرض `status` و`readAt` مباشرة، فهذه الاستنتاجات يجب أن تكون متّسقة.

3. **`title` موجود على `Conversation`** — للآن غير مستخدم (محادثات مباشرة فقط). الواجهة لا تعرضه.

---

## 3. المتبقي — مرتّب حسب الأولوية

### المرحلة A — التحقق والجودة

- [x] `npx eslint .` يمر نظيفاً (فعّل typed linting عبر `projectService` ليعمل `no-floating-promises`)
- [x] إصلاحات مطلوبة من اللينت:
  - [x] `navigate()` يُعيد promise في React Router 7 → `void` في 3 ملفات
  - [x] كتابة ref أثناء الـ render في `SessionProvider` → نُقلت إلى effect
  - [x] `setState` داخل effect في `MessageInput` و`ProfilePanel` → نُقل إلى render (النمط الذي توثّقه React)
  - [x] تصدير helpers من ملف component في `RealtimeProvider` → نُقلت إلى `features/realtime/cache.ts`
- [x] اختبارات Vitest — **71 اختبار، كلها تمر**:
  - [x] `format.test.ts` — الطوابع، `formatDayDivider`، `formatUnreadCount` (الجمع العربي)، `initials`، `avatarHue`
  - [x] `api-error.test.ts` — `isRetryableError` على كل الحالات، وحفظ رسالة الـ backend
  - [x] `cache.test.ts` — `flattenMessages` · `upsertMessage` (إدراج/ترتيب/مطابقة clientId) · `patchConversationsList`
  - [x] `useTypingStore.test.ts` — انتهاء الصلاحية بعد 3s، وبقاء المؤشر أثناء الكتابة
  - [x] `schemas.test.ts` — قواعد Zod مقابل بنود الـ contract
- [ ] اختبارات مكوّن (`MessageBubble`، `Avatar`، `EmptyState`) بـ Testing Library
- [ ] تحسين الحزمة: `566 kB` (175 kB gzip). تقسيم بـ `React.lazy` للصفحات Auth و Profile
- [x] إصلاح pool في Vitest: `forks` كان يفشل على Windows من مسار فيه مسافات → `threads`
- [ ] تشغيل `npm run dev` وفحص RTL يدوياً على 3 مقاسات

**حالة التحقق الآن:**

| البوابة | الأمر | النتيجة |
| --- | --- | --- |
| Typecheck | `npx tsc -b --noEmit` | ✅ exit 0 |
| Lint | `npx eslint .` | ✅ exit 0 |
| Unit tests | `npx vitest run` | ✅ 71/71 |
| Build | `npx vite build` | ✅ 566 kB → 175 kB gzip |

### المرحلة B — ربط الـ Backend (بعد موافقة المطور الآخر على الـ contract)

- [ ] مراجعة `docs/api-contract.md` مع المطور الآخر وتثبيت أي اختلاف **بتغيير في نفس الـ commit**
- [ ] تشغيل الـ backend محلياً وضبط `VITE_API_URL` / `VITE_WS_URL`
- [ ] التحقق من مطابقة كل نقطة نهاية للـ contract فعلياً (خاصة `clientId` de-dup و `fields` في الأخطاء)
- [ ] التأكد من أن `4001/4401` على WS يوقف إعادة الاتصال حتى يتم الـ refresh
- [ ] التأكد من أن `Retry-After` يُقرأ على `RATE_LIMITED`

### المرحلة C — Playwright E2E

ملف `playwright.config.ts` غير موجود بعد. المطلوب:

- [ ] إعداد Playwright + `webServer` يشغّل `vite preview`
- [ ] Mock للـ REST **و** WebSocket عبر `page.route()` + حقن `WebSocket` وهمي — حتى لا تتذبذب الاختبارات على backend حقيقي
- [ ] المسارات المطلوبة:
  - [ ] تسجيل حساب جديد
  - [ ] دخول → خروج
  - [ ] التنقل بين المحادثات
  - [ ] إرسال رسالة ومظهرها
  - [ ] استقبال رسالة عبر WS
  - [ ] التخطيط على 375px / 768px / 1280px
  - [ ] حالة الخطأ (network error يظهر `ErrorState`)
  - [ ] حالة التحميل (skeleton يظهر)
  - [ ] حالة فارغة (لا محادثات)
- [ ] Tests/e2e fixtures لمستخدمين ودردشة ثابتين

### المرحلة D — Polish

- [ ] مراجعة-contrast للألوان في الوضعين (WCAG AA)
- [ ] فحص `prefers-reduced-motion` بصرياً
- [ ] Focus trap في الـ modal — `dialog` يعالجه أصلاً، المطلوب التأكد فقط
- [ ] اختبار Safari/iOS: `dvh` و `env(safe-area-inset-bottom)` ولوحة المفاتيح
- [ ] حالة "غير متصل" عامة في الشريط الجانبي أيضاً

---

## 4. مخاطر ومعروفة يجب تسويةها

| المشكلة | التفصيل | الأثر |
| --- | --- | --- |
| **لا يوجد backend بعد** | الواجهة مبنية على الـ contract وليس على API حقيقي | كل تدفق REST/WS غير مُتحقّق منه فعلياً. **هذه أهم نقطة** |
| **حجم الحزمة 566 kB** | حد Vite_warning (500 kB) | أداء على الهاتف — يحتاج code splitting |
| **localStorage للتوكنات** | متفق عليه في الـ contract لتبسيط ما بعد التطوير | ثغرة XSS. موثّق في `token-store.ts` |
| **قائمة الرسائل غير مُvirtualized** | كل الرسائل في الـ DOM | مشكلة مع محادثات طويلة جداً. مقبول لـ v1، noted للاحتفاظ |
| **لا اختبارات مكوّنات** | لا Testing Library بعد | الـ logic مغطّى بـ 71 اختبار، لكن العرض غير مغطّى |
| **لا اختبارات E2E بعد** | لا Playwright بعد | التدفقات الكاملة غير مُتحقّق منها آلياً |
| **مسار المجلد فيه مسافات** | كسر Vitest و Playwright افتراضياً على Windows | تم حلّه لـ Vitest بـ `pool: threads` · Playwright يحتاج تحقّق |

---

## 5. Git Workflow المتبقّي

- فرع العمل: `feat/frontend-<topic>` من `main`
- commits صغيرة: `test:` · `fix:` · `refactor:` · `chore:`
- **لا تعديل على ملفات الـ backend** — الـ backend في مستودع/مجلد المطور الآخر
- قبل أي PR: `npm run typecheck && npm run lint && npm test && npm run build` الكل أخضر
- `main` محمي — لا push مباشر

---

## 6. غير المطلوب في v1 (لاحقاً)

Groups · Files · Voice · Calls · AI · Message editing/deletion · Avatar upload · Presence للدردثات الجماعية.

الأساس جاهز لـ: `Conversation.type` و `User` embedded يسمحان بالتوسّع، وطبقة `api.ts` تجعل إضافة endpoint ملف واحد.
