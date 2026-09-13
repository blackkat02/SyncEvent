# Міграція валідації на zod / nestjs-zod (заміна yup + class-validator)

> Статус: **виконано, усі 5 фаз** (2026-09-13). Соло-проєкт, автор — Borys.
> Створено: 2026-09-13.
> Пов'язаний код: `packages/shared/src/schemas/auth.schema.ts`, `packages/shared/src/schemas/event.schema.ts`,
> `apps/backend/src/auth/auth.controller.ts`, `apps/backend/src/events/dto/create-event.dto.ts`,
> `apps/backend/src/events/dto/update-event.dto.ts`, `apps/backend/src/common/dto/pagination.dto.ts`,
> `apps/backend/src/main.ts`, `apps/frontend/src/pages/CreateEventPage.tsx`,
> `apps/frontend/src/features/auth/components/{Login,Register}Form.tsx`.
> (`apps/backend/src/common/pipes/yup-validation.pipe.ts` видалено в Фазі 2.)

---

## 0. TL;DR / рішення

1. Зараз у проєкті **дві незалежні системи валідації**: `yup` (спільні схеми в `packages/shared` +
   кастомний `YupValidationPipe` на беку + `yupResolver` на фронті) і `class-validator`/`class-transformer`
   (частина Nest DTO: `CreateEventDto`, `PaginationDto`, підключені через глобальний `ValidationPipe`).
2. Ціль — **одна схема валідації на весь стек**: `zod` у `packages/shared`, `nestjs-zod` на беку
   (замінює і `YupValidationPipe`, і `class-validator`-DTO), `zodResolver` на фронті.
3. Міграція йде **знизу вгору**: спочатку спільні схеми (§4, Фаза 1), потім бек (Фаза 2-3), потім
   фронт (Фаза 4), і тільки після того, як усе живе на zod — прибираємо старі залежності (Фаза 5).
4. Обсяг реально малий: 4 файли схем/DTO, 1 кастомний pipe, 1 місце на фронті (`CreateEventPage.tsx`) —
   див. інвентаризацію в §1.
5. Головний ризик не в самій заміні валідатора, а в **Swagger-документації**: зараз вона генерується з
   `@ApiProperty()` + `class-validator`-декораторів. `nestjs-zod` вміє генерувати Swagger-схему з zod
   напряму (`patchNestjsSwagger()`), але це треба явно перевірити на реальному `/docs`, а не вважати
   само собою зрозумілим (див. Фазу 3, крок 2).

---

## 1. Інвентаризація поточного стану (як є зараз)

### 1.1. `yup`

| Файл | Роль |
|---|---|
| `packages/shared/src/schemas/auth.schema.ts` | `registerSchema`, `loginSchema` + типи через `yup.InferType` |
| `packages/shared/src/schemas/event.schema.ts` | `createEventSchema`, `updateEventSchema`, enum `EventVisibility` |
| `apps/backend/src/common/pipes/yup-validation.pipe.ts` | кастомний `PipeTransform`, форматує `yup.ValidationError` у `{statusCode, message, errors: {field: msg}}` |
| `apps/backend/src/auth/auth.controller.ts` | `@UsePipes(new YupValidationPipe(registerSchema))` на `/auth/register` і `/auth/login` — **єдине** місце на беку, де yup реально валідує вхід |
| `apps/frontend/src/pages/CreateEventPage.tsx` | `yupResolver(createEventSchema)` для `react-hook-form` |
| `apps/frontend/src/features/auth/components/LoginForm.tsx` | `yupResolver(loginSchema)` для `react-hook-form` |
| `apps/frontend/src/features/auth/components/RegisterForm.tsx` | `yupResolver(registerSchema)` для `react-hook-form` |

> Виправлення (2026-09-13, під час Фази 1): початкова версія цієї таблиці помилково називала
> `CreateEventPage.tsx` "єдиним місцем на фронті" — насправді `yupResolver` на auth-схемах
> використовується ще у двох формах (`LoginForm.tsx`, `RegisterForm.tsx`). Виявлено компілятором:
> після переписування `auth.schema.ts` на zod (`tsc -p tsconfig.app.json`, бо кореневий
> `tsconfig.json` — solution-файл з `files: []`, який без `--build` мовчки не перевіряє нічого)
> обидва файли перестали компілюватись, бо `yupResolver` не приймає `ZodObject`. Усі три файли
> увійдуть у Фазу 4.

### 1.2. `class-validator` / `class-transformer`

| Файл | Роль |
|---|---|
| `apps/backend/src/events/dto/create-event.dto.ts` | `CreateEventDto` — декоратори `@IsString`, `@IsDateString`, `@IsEnum` тощо + `@ApiProperty()` для Swagger |
| `apps/backend/src/common/dto/pagination.dto.ts` | `PaginationDto` — `@Type(() => Number)` + `@IsInt/@Min/@Max` |
| `apps/backend/src/main.ts` | глобальний `app.useGlobalPipes(new ValidationPipe({transform: true, whitelist: true}))` — це те, що реально запускає валідацію обох DTO вище |

### 1.3. Важлива нестиковка форми, яку міграція **не повинна** тихо "виправити"

`createEventSchema` (yup, фронт) очікує `dateStr` + `timeStr` (окремі поля форми), а `CreateEventDto`
(class-validator, бек) очікує вже зібране ISO-`date`. Тобто фронт і бек **зараз і так** валідують дві різні
форми того самого запиту — конвертація `dateStr+timeStr → date` відбувається в самому
`CreateEventPage.tsx` перед відправкою. Це не помилка, яку створює міграція, а наявний факт, який треба
свідомо зберегти (або виправити окремим рішенням) — див. відкрите питання в §6.

---

## 2. Чому саме zod / nestjs-zod (стисло)

| Критерій | yup + class-validator (зараз) | zod + nestjs-zod (ціль) |
|---|---|---|
| Кількість систем валідації | 2 (різні на фронті і в різних частинах бека) | 1 |
| Джерело типів | `yup.InferType` (схема) і ручні `class`-поля (DTO) — два незалежні джерела правди для однієї сутності (`Event`, `Auth`) | `z.infer` з тієї самої схеми і на фронті, і на беку |
| Розширюваність схем | `yup` дозволяє довільні `.transform()`, але слабший inference на вкладених/union-типах | `zod` — TS-first, кращий inference, `.refine()`/`.superRefine()` для крос-полів |
| Nest-інтеграція | кастомний саморобний pipe (`yup-validation.pipe.ts`) для yup-частини; готова `ValidationPipe` для class-validator-частини | одна готова бібліотека (`nestjs-zod`), `createZodDto` + `ZodValidationPipe`, без саморобного коду |
| Swagger | автоматично з `@ApiProperty` (class-validator-частина); для yup-частини (`auth`) Swagger узагалі не описує тіло запиту декораторами — покладається на сирі DTO-типи | `nestjs-zod` генерує OpenAPI-схему прямо з тієї ж zod-схеми, що валідує запит — джерело правди одне і для рантайму, і для документації |

---

## 3. Цільова архітектура

```
packages/shared/src/schemas/*.ts     — zod-схеми (єдине джерело правди для форми/типу)
        │
        ├─▶ apps/backend  — createZodDto(schema) + ZodValidationPipe (глобально або per-route)
        │                   nestjs-zod: patchNestjsSwagger() генерує OpenAPI з тих же схем
        │
        └─▶ apps/frontend — zodResolver(schema) для react-hook-form
```

Ключове рішення: **не тримати окремо "DTO-класи" і "форм-схеми"** — там, де зараз є `CreateEventDto`
(клас) і `createEventSchema` (yup-об'єкт) як два окремі описи однієї сутності, після міграції лишається
один zod-об'єкт у `packages/shared`, а Nest-DTO — це тонка обгортка `createZodDto(createEventSchema)`
навколо нього, а не паралельне визначення полів.

---

## 4. Поетапний план

### Фаза 0 — підготовка, без зміни поведінки
- [ ] Додати `zod` у `packages/shared/package.json` (dependency) і в `apps/backend`, `apps/frontend`
  (або тільки в shared, якщо workspace-резолюція typescript-типів це дозволяє без прямої залежності —
  перевірити фактичну потребу при білді).
- [ ] Додати `nestjs-zod` у `apps/backend/package.json`.
- [ ] `@hookform/resolvers` (вже стоїть, `^5.2.2`) — переконатись, що версія експортує `zodResolver`
  (експортує з коробки, окремого пакета типу `@hookform/resolvers/zod` встановлювати не треба — це
  підшлях того самого пакета).
- [ ] Зафіксувати версію `zod` (v3 чи v4) — `nestjs-zod` і `@hookform/resolvers` мають вимоги до
  major-версії zod, звірити сумісність перед `npm install`, а не постфактум.

### Фаза 1 — переписати спільні схеми на zod (`packages/shared`)
- [ ] `auth.schema.ts`: `registerSchema`/`loginSchema` на `z.object({...})`, типи через
  `z.infer<typeof schema>` замість `yup.InferType`. Зберегти назви експортів (`RegisterInput`,
  `LoginInput`, `LoginDto`, `RegisterDto`) — щоб не займатись правками імпортів по всьому коду в цій же фазі.
- [ ] `event.schema.ts`: `createEventSchema`/`updateEventSchema` на zod; `EventVisibility` — через
  `z.enum(['PUBLIC', 'PRIVATE'])` або залишити поточний `as const`-об'єкт і звірити його з`z.nativeEnum`
  (обрати те, що дає зручніший inference разом із рештою типів у `types/event.ts`).
  Звернути увагу на `capacity` — у yup-версії є `.transform()` для приведення рядка з форми до числа/null;
  у zod це `z.preprocess()` або `z.coerce.number()` — перевірити на реальній формі (порожній рядок,
  `"0"`, від'ємне число), бо саме тут найлегше непомітно змінити поведінку валідації.
- [ ] Юніт-тести на самі схеми (валідні/невалідні payload) — якщо їх ще нема, додати мінімальний набір
  до переходу далі, щоб Фази 2-4 мали на що спиратись при регресії.

### Фаза 2 — бек: замінити `YupValidationPipe` на `nestjs-zod` (лише auth) ✅ (2026-09-13)
- [x] Прибрати `apps/backend/src/common/pipes/yup-validation.pipe.ts`.
- [x] У `auth.controller.ts`: замінити `@UsePipes(new YupValidationPipe(registerSchema))` /
  `loginSchema` на `@UsePipes(new ZodValidationPipe(...))` з `nestjs-zod` — той самий per-route
  патерн виклику, без DTO-класів (`createZodDto` лишили для Фази 3, DTO/class-validator).
- [x] Формат помилки validation **змінився** (`errors` тепер масив `ZodIssue[]`, а не мапа
  `{field: msg}`), і це свідомо прийнято без кастомного `createValidationException`: перевірено
  кодом (`LoginForm.tsx`/`RegisterForm.tsx`), що фронт це поле взагалі не читає — `catch` там лише
  робить `console.error`, помилки під полями форми беруть з клієнтського резолвера ще до запиту.
  Ризик, позначений у цьому пункті раніше, на практиці не матеріалізувався.
- [x] Рантайм-перевірка (прямий виклик `pipe.transform()`, без підняття всього Nest-застосунку):
  `loginSchema` з `{email: 'not-an-email', password: ''}` → 400, `"Invalid email"` / `"Password is
  required"` (підтверджує фікс із Фази 1 для порожнього пароля); `registerSchema` з `{}` → 400,
  `"Email is required"` / `"Password is required"` для повністю відсутніх полів.

### Фаза 3 — бек: перевести `class-validator`-DTO на `createZodDto` ✅ (2026-09-13)

> Корекція плану: пункт нижче спершу передбачав `CreateEventDto → createZodDto(createEventSchema)`,
> тобто перевикористання спільної форм-схеми з фронту. Це виявилось **неправильним** ще до написання
> коду: `createEventSchema` (yup/zod, Фаза 1) описує форму на фронті (`dateStr`+`timeStr`, обов'язкові),
> а реальне тіло запиту `POST /events` (перевірено в `CreateEventPage.tsx`, `onSubmit`) — це
> `{title, location, visibility, description, capacity, date}`, без `dateStr`/`timeStr` узагалі
> (конвертація в `date` відбувається на фронті до відправки, як і зафіксовано в §1.3). Тобто у
> `createEventSchema` і в реальному wire-контракті **різні, несумісні форми одного запиту** — це вже
> була поведінка `class-validator`-`CreateEventDto` до міграції (він теж ніколи не описував
  `dateStr`/`timeStr`), просто план це не врахував. Виправлення: для DTO написана **окрема, локальна
  для бекенду** zod-схема (`createEventDtoSchema` в `create-event.dto.ts`), що описує саме wire-контракт,
  а не форму. Уніфікація цих двох схем (форма vs wire) — окреме, більш ризиковане рішення, свідомо не
  зроблене в межах цієї міграції (див. відкрите питання §6).

- [x] `CreateEventDto`: нова локальна `createEventDtoSchema` (zod) + `class CreateEventDto extends
  createZodDto(createEventDtoSchema) {}`. `date` — `z.iso.datetime().describe('ISO string date')`
  (перевірено окремим скриптом: приймає точно те, що шле фронт — `combinedDate.toISOString()`, з
  мілісекундами і без; відхиляє дату без часу, що трохи строгіше за `@IsDateString()`, але жодного
  реального payload з такою формою в застосунку нема).
- [x] **Знайдено і виправлено побічний ефект, якого не було в первинному плані**: `update-event.dto.ts`
  визначав `UpdateEventDto` через `PartialType(CreateEventDto)` з `@nestjs/swagger` — цей хелпер читає
  метадані `class-validator`/`@ApiProperty`-декораторів і після переведення `CreateEventDto` на
  `createZodDto` перестав би бачити будь-які поля (decorators зникли). Виправлено на нативний
  zod-механізм: `class UpdateEventDto extends createZodDto(createEventDtoSchema.partial()) {}` —
  без залежності від `@nestjs/swagger`-хелперів узагалі.
- [x] `PaginationDto` → локальна `paginationSchema`: `z.coerce.number().int().min(1).default(1)` /
  `...max(100).default(10)`. Лишена локально в беку (не в `packages/shared`) — query-параметри
  пагінації не потрібні як форма на фронті.
- [x] Глобальний `app.useGlobalPipes(new ValidationPipe(...))` у `main.ts` → `app.useGlobalPipes(new
  ZodValidationPipe())` (без аргумента — pipe визначає схему з `metatype` параметра, це задокументована
  поведінка `nestjs-zod` для глобального режиму). **Перед заміною** — повна інвентаризація всіх
  `@Body()/@Query()/@Param()` по всьому бекенду (не тільки events): жодних інших class-validator-DTO чи
  `PartialType`/`OmitType`/`PickType` не знайдено, отже blast radius обмежений трьома DTO вище.
  `strictSchemaDeclaration` **не вмикався** (README це рекомендує) — це окрема, ширша зміна поведінки
  (перетворює всі нетипізовані `@Body`/`@Query`/`@Param`, як-от `@Param('id') id: string`, на 500-ки),
  не пов'язана з заміною бібліотеки валідатора; лишено як відкрите питання на майбутнє, не зроблено
  зараз.
- [x] Swagger: `patchNestjsSwagger()` **не існує у встановленій версії `nestjs-zod@5.5.0`** (це API
  старіших мажорних версій — план спирався на застарілу згадку, перевірено по реальних `.d.ts`/README
  пакета, а не по пам'яті). Актуальний механізм — `cleanupOpenApiDoc(document)`, яким обгорнутий виклик
  `SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document))`. Перевірено не через підняття всього
  застосунку (уникнув зайвого підключення до Kafka/Redis/Postgres, поки в docker уже крутиться робочий
  бекенд), а прямим викликом `CreateEventDto._OPENAPI_METADATA_FACTORY()` — підтвердив коректні типи,
  `required`, enum `PUBLIC`/`PRIVATE`, збережений опис `"ISO string date"`, і саме внутрішні службові
  поля (`x-nestjs_zod-uses-3-point-1-syntax`, порожній `type: ""` для nullable через `anyOf`), які прибирає
  `cleanupOpenApiDoc()` — підтвердило, що цей крок не косметичний, а обов'язковий.
- [x] Рантайм: повний jest-сьют бекенда — **11 suites, 78 тестів, усі проходять** (включно з
  `events.service.spec.ts`, який типізує сирі об'єкти як `CreateEventDto` — структурна типізація z-DTO
  це дозволяє без змін у самому спек-файлі).

### Фаза 4 — фронт: `yupResolver` → `zodResolver` ✅ (2026-09-13)
- [x] `CreateEventPage.tsx`: `yupResolver(createEventSchema)` → `zodResolver(createEventSchema)`;
  `type EventFormState = yup.InferType<...>` → `z.infer<...>`; прибрано `import * as yup from "yup"`.
  Каст `as Resolver<EventFormState>` **лишений як є** — він уже був потрібен до міграції (через
  розбіжність input/output типів у `capacity`, який трансформується), це не нова проблема і не в
  межах цього кроку її виправляти.
- [x] `LoginForm.tsx`, `RegisterForm.tsx`: `yupResolver(...)` → `zodResolver(...)` з
  `@hookform/resolvers/zod`.
- [x] Компіляція фронтенда (`tsc -p tsconfig.app.json`) — чисто, 0 помилок.
- [x] Повторний grep по всьому репо (`from 'yup'`, `@hookform/resolvers/yup`) — 0 збігів, yup більше
  ніде в коді не імпортується.
- [x] Перевірка не в браузері (розширення Claude in Chrome відхилено користувачем цього разу), а прямим
  викликом того самого резолвера, що дергає react-hook-form усередині форми — `zodResolver(schema)
  (values, undefined, {})` — з реальними некоректними і коректними значеннями для всіх трьох форм.
  Підтверджено на практиці, не тільки в теорії: порожній пароль при логіні → `"Password is required"`
  (саме той фікс з Фази 1); порожній `title` в `createEventSchema` → `"Too short"`, а не
  `"Title is required"` (та сама текстова розбіжність з yup, описана в Фазі 1 — підтверджена
  фактичним викликом резолвера); `capacity: ''` → без помилки, коректно перетворюється на `null`;
  `capacity: '10'` (рядок з `<input type="number">`) → коректно стає числом `10`.

### Фаза 5 — прибрати старі залежності ✅ (2026-09-13, виконано користувачем)
- [x] `pnpm --filter backend remove yup class-validator class-transformer`
- [x] `pnpm --filter frontend remove yup`
- [x] `pnpm --filter @syncevent/shared remove yup`
- [x] `pnpm remove yup -w` (корінь)
- [x] Перевірка: `grep` на `"yup"`/`"class-validator"`/`"class-transformer"` у всіх чотирьох
  `package.json` — 0 збігів.
- [x] `pnpm --filter @syncevent/shared build` + `pnpm --filter backend exec jest` — **11 suites, 78
  тестів, усі проходять**. `ERROR`/`WARN` у виводі (`PrismaExceptionFilter: ... "boom"`,
  `OutboxRelayService: broker down`, `BookingProcessor: Event is full`, `KafkaProducerService: not
  connected at boot`) — навмисні негативні тест-кейси відповідних сервісів, не регресії.

## Підсумок: міграція завершена (усі 5 фаз)

Бекенд і фронтенд повністю на zod / `nestjs-zod`. `yup`, `class-validator`, `class-transformer` більше
не встановлені і ніде в коді не імпортуються. Найважливіші відхилення від початкового плану, знайдені
й задокументовані по дорозі (§1.1 корекція, §Фаза 2 формат помилок, §Фаза 3 wire-схема vs форм-схема
та `PartialType`-пастка, §Фаза 3 `patchNestjsSwagger()` → `cleanupOpenApiDoc()`) — залишені в тексті
фаз вище як історія рішень, не прибрані заднім числом.

---

## 5. Порядок виконання і залежності між фазами

Фази 1→2→3→4 лінійно залежні (кожна наступна спирається на схеми з попередньої). Фазу 5 не можна
починати, поки Фази 2-4 не завершені **всі** — інакше зникне залежність, яку ще щось використовує.
Це саме той тип роботи, де варто зупинятись після кожної фази для рев'ю (кожна фаза сама по собі — робочий
проміжний стан, який можна закомітити окремо), а не проганяти все за один прохід.

---

## 6. Відкриті питання

- **Формат `date` vs `dateStr`/`timeStr` (§1.3)** — міграція валідатора не вирішує цю розбіжність форм
  фронту і бека, лише переносить її як є. Окреме рішення: або уніфікувати схему (`dateStr`+`timeStr`
  на обох рівнях, конвертація в `date` тільки в Prisma-шарі), або лишити конвертацію на фронті, як
  зараз, — не чіпати в межах цієї міграції, якщо не буде окремого запиту.
- **Формат помилок валідації** (§ Фаза 2) — чи зберігати поточний `{errors: {field: msg}}` (зручно для
  форм) через кастомний exception filter над `nestjs-zod`, чи прийняти дефолтний формат бібліотеки і
  оновити фронтенд-обробку помилок відповідно. Треба вирішити до Фази 2, а не за фактом.
- **`zod` v3 vs v4** — на момент написання плану не зафіксовано, яку major-версію ставити; залежить від
  того, яку вимагають актуальні на момент виконання версії `nestjs-zod` і `@hookform/resolvers`.
