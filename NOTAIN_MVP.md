# Notain — MVP Specification

Tagline: Bikin nota. Kirim. Selesai.

Notain adalah web app sederhana untuk membantu UMKM membuat invoice/nota profesional, mengubahnya menjadi PDF, lalu menyiapkan pesan untuk dikirim melalui WhatsApp.

## 1. MVP Goal

Tujuan MVP adalah memvalidasi satu hal:

Apakah UMKM merasa membuat invoice dengan Notain lebih mudah dan cepat dibanding membuat nota/invoice secara manual?

MVP harus fokus pada satu workflow utama:

```
Open Notain
    ↓
Business Profile
    ↓
Create Invoice
    ↓
Add Customer + Items
    ↓
Automatic Calculation
    ↓
Live Preview
    ↓
Generate PDF
    ↓
Download PDF
    ↓
Open WhatsApp with Prepared Message
```

Prinsip utama

- Simple
- Fast
- Mobile-first
- Easy to understand
- Indonesian-friendly
- Minimal clicks
- No unnecessary enterprise features
- No AI
- No database
- No backend
- No authentication
- No payment gateway

## 2. Product Positioning

Notain bukan accounting software.

Notain bukan ERP.

Notain bukan inventory management.

Notain adalah:

alat cepat untuk membuat invoice/nota dan mengirimkannya ke customer.

Target utama:

- UMKM
- Online seller
- Freelancer
- Jasa kecil
- Warung
- Toko kecil
- Home business
- Service business

## 3. UX Philosophy

Setiap halaman harus menjawab:

"User harus melakukan apa sekarang?"

User tidak boleh dipaksa memahami konsep accounting.

Gunakan bahasa yang familiar untuk pengguna Indonesia.

Hindari

- Create New Invoice
- Customer Information
- Invoice Configuration
- Payment Terms
- Generate Document

Gunakan

- Buat Invoice
- Untuk siapa invoice ini?
- Tambah barang
- Catatan untuk customer
- Preview invoice
- Download PDF
- Kirim via WhatsApp

## 4. Visual Direction

### Overall Style

Modern SaaS × WhatsApp-friendly × UMKM

Referensi rasa visual:

- Clean
- Friendly
- Trustworthy
- Professional
- Warm
- Plenty of whitespace
- Clear hierarchy

Hindari:

- Enterprise accounting dashboard
- Terlalu banyak chart
- Excessive gradients
- Excessive glassmorphism
- Excessive animations
- Too many colors
- UI yang terlihat kompleks

### Color Direction

Base:

```
Background: #F8F8F6
Text:       #171717
Secondary:  #737373
Card:       #FFFFFF
Border:     #E5E5E5
Accent:     Green
```

Accent hijau digunakan sebagai action/success color, tetapi jangan membuat aplikasi terlihat seperti clone WhatsApp.

### Typography

Gunakan typography yang:

- Sangat mudah dibaca
- Memiliki hierarchy jelas
- Nyaman di mobile
- Tidak terlalu dekoratif

## 5. Tech Stack

### Core

- Astro
- TypeScript
- Tailwind CSS

### UI

- Astro Components
- Lucide icons

### Validation

- Zod

### PDF

- pdf-lib

### Storage

- Browser localStorage

### Formatting

- Native Intl API

### Testing

- Vitest

### Code Quality

- ESLint
- Prettier

### Deployment

- Render Static Site

### Repository

- GitHub

## 6. Explicitly NOT in MVP

Do NOT implement:

- PostgreSQL
- Supabase database
- Redis
- Bun backend
- Elysia backend
- Authentication
- User accounts
- Email verification
- Payment gateway
- Subscription system
- AI
- Cloud storage
- Invoice API
- Accounting reports
- Inventory
- Tax reporting
- Multi-user collaboration
- Team management
- Mobile app
- Admin panel
- Analytics dashboard
- Complex state management unless genuinely necessary

Do not add dependencies just because they are popular.

Prefer native browser APIs and simple TypeScript utilities.

## 7. MVP Roadmap

There are exactly 10 major steps.

### Step 1 — Project Setup

Initialize:

- Astro
- TypeScript
- Tailwind CSS
- ESLint
- Prettier
- Vitest

Create basic project structure.

Done when

- Project runs locally
- TypeScript works
- Tailwind works
- Linting works
- Tests can run
- Production build succeeds

### Step 2 — Design System & UI Foundation

Create reusable UI primitives:

- Button
- Input
- Textarea
- Select
- Card
- Badge
- Modal
- Toast
- Empty State
- Divider
- Loading state

Define:

- Colors
- Typography
- Spacing
- Border radius
- Shadows
- Focus states
- Disabled states
- Error states

Done when

- The application has a consistent visual language.

### Step 3 — Landing Page

Landing page must immediately explain Notain.

Hero:

```
Bikin invoice.
Kirim. Selesai.

Buat invoice profesional untuk bisnis kamu,
download PDF-nya, lalu kirim ke customer
langsung lewat WhatsApp.

[ Buat Invoice Gratis ]
```

Show a realistic invoice preview.

Do not create a long marketing landing page.

Suggested sections:

- Hero
- How it works
- Invoice preview
- Benefits
- CTA

Done when

- A first-time visitor can understand the product within a few seconds.

### Step 4 — Business Onboarding

When the user starts for the first time:

```
Selamat datang di Notain 👋

Kita buat invoice pertama kamu.
```

Fields:

- Business name
- WhatsApp number
- Address
- Email (optional)
- Logo (optional)

Store this locally.

UX requirement

- Do not make onboarding feel like a registration form.
- There is no account.
- There is no login.
- The user's business profile belongs to their browser.

Done when

- User can complete onboarding and enter the dashboard.

### Step 5 — Dashboard

Dashboard should remain simple.

Example:

```
Good morning 👋

Warung Maju

[ + Buat Invoice ]

Invoice kamu

INV-001
Budi
Rp60.000
Hari ini
```

Dashboard should NOT become an accounting dashboard.

No:

- Revenue charts
- Profit charts
- Cash flow
- Complex metrics

Initial dashboard only needs:

- Business identity
- Create invoice CTA
- Recent invoices
- Empty state

Empty state

Example:

```
Belum ada invoice

Buat invoice pertama kamu
dan kirim ke customer dalam hitungan menit.

[ Buat Invoice ]
```

### Step 6 — Invoice Builder

This is the core feature.

Invoice fields:

Business

- Automatically populated from business profile.

Customer

- Customer name
- Customer WhatsApp number (optional)

Invoice

- Invoice number
- Invoice date
- Due date (optional)

Items

Each item:

- Name
- Quantity
- Unit price
- Calculated subtotal

Example:

```
Nasi Goreng
2 × Rp20.000
Rp40.000
```

Actions:

- - Tambah item

Financial summary

- Subtotal
- Discount (optional)
- Tax (optional)
- Total

Notes

- Optional free text.

Example:

```
Terima kasih sudah berbelanja 🙏
```

## 8. Calculation Rules

All calculations must be deterministic and centralized.

Example:

```
item subtotal = quantity × unit price
subtotal = sum(all item subtotals)
total = subtotal - discount + tax
```

Do not scatter calculation logic across UI components.

Create a dedicated utility:

```
src/lib/invoice/calculator.ts
```

Include tests.

Example test cases:

- One item
- Multiple items
- Quantity greater than 1
- Zero discount
- Discount
- Tax
- Empty items
- Large numbers

Avoid floating-point mistakes when working with currency.

Prefer integer Rupiah values internally.

Example:

```
20000
```

instead of:

```
20000.00
```

## 9. Invoice Preview

Preview must update when invoice data changes.

Desktop:

```
┌──────────────────────┬──────────────────────┐
│ Invoice Form         │ Live Preview         │
│                      │                      │
│ Customer             │  BUSINESS NAME       │
│ [ Budi             ] │                      │
│                      │  Invoice #INV-001    │
│ Items                │                      │
│ [ Nasi ] [2] [20K]  │                      │
│                      │  Nasi    2   40K    │
│ + Tambah item        │  Es Teh  2   20K    │
│                      │                      │
│                      │  Total     Rp60.000  │
└──────────────────────┴──────────────────────┘
```

Mobile:

```
Form
↓
Preview
↓
Actions
```

The preview should feel like a real invoice, not a generic card.

## 10. PDF Generator

Use pdf-lib.

PDF should include:

- Business name
- Business logo if available
- Business address
- Business contact
- Invoice number
- Invoice date
- Customer
- Item table
  - Quantity
  - Unit price
  - Subtotal
- Discount
- Tax if applicable
- Total
- Notes

PDF should look professional and printable.

Default format:

- A4
- Clean margins
- Readable typography
- Clear hierarchy

Create:

```
src/lib/invoice/pdf.ts
```

The PDF generation logic should be independent from UI components.

Done when

A generated PDF can be:

- Opened
- Downloaded
- Printed
- Read easily on mobile/desktop

## 11. Local Storage

Since MVP has no database, persist data locally.

Suggested keys:

- notain_business
- notain_invoices
- notain_settings

Keep storage access centralized:

```
src/lib/storage/local.ts
```

Do not call localStorage randomly throughout components.

Handle browser-only access correctly because Astro can render on the server during build.

Example conceptual API:

```
getBusiness()
saveBusiness()
getInvoices()
saveInvoice()
deleteInvoice()
getInvoiceById()
```

## 12. Invoice Numbering

Invoice number should be generated automatically.

Example:

```
INV-2026-001
INV-2026-002
INV-2026-003
```

The number should be easy for a business owner to understand.

Keep internal ID separate from invoice number.

Example:

```
id: abc123xyz
invoiceNumber: INV-2026-001
```

## 13. WhatsApp Flow

Notain does NOT use WhatsApp API in MVP.

Use WhatsApp click-to-chat.

Flow:

```
[ Kirim via WhatsApp ]
        ↓
Open WhatsApp
        ↓
Prepared message
        ↓
User attaches PDF manually
        ↓
Send
```

Important:

- A normal wa.me URL cannot automatically attach a locally generated PDF file.
- Do not promise automatic PDF attachment.

Prepared message example:

```
Halo Budi 👋

Berikut invoice INV-2026-001
dari Warung Maju sebesar Rp60.000.

Terima kasih 🙏
```

## 14. Mobile-first UX

Target user may use:

- Android
- Chrome
- Mobile data
- Small screen

Therefore:

- Design mobile-first
- Large touch targets
- Clear CTA
- Avoid tiny controls
- Avoid horizontal scrolling
- Keep form steps obvious
- Make price entry fast

Primary mobile workflow:

```
Open
↓
Buat Invoice
↓
Customer
↓
Items
↓
Total
↓
Preview
↓
Download
↓
WhatsApp
```

## 15. Nice-to-have Features Inside MVP

These are allowed because they improve the core workflow without requiring backend infrastructure.

- Automatic currency formatting
  - Input: `20000`
  - Display: `Rp20.000`
  - Use Intl API.
- Automatic totals
  - No manual calculator.
- Live preview
  - Preview updates immediately.
- Business profile reuse
  - User fills business information once.
  - Every invoice uses it automatically.
- Invoice templates
  - Start with three:
    - Classic
    - Minimal
    - Modern
  - Do not create a complex template marketplace.
- Toast feedback
  - Examples:
    - Invoice berhasil disimpan
    - PDF berhasil dibuat
- Confirmation before destructive actions
  - For delete invoice:

```
Hapus invoice ini?

[ Batal ] [ Hapus ]
```

## 16. Responsive Requirements

Breakpoints should not only be treated as "desktop/tablet/mobile" styling.

Components should be designed to adapt naturally.

Mobile

- Single column
- Form above preview
- Sticky or easily accessible action area
- Large CTA

Tablet

- More breathing room
- Optional two-column sections

Desktop

- Form + preview split
- Preview stays visible where possible

Do not allow the UI to become unnecessarily wide.

## 17. Accessibility

Minimum requirements:

- Semantic HTML
- Labels for inputs
- Keyboard navigation
- Visible focus states
- Good contrast
- Buttons must have clear labels
- Icons should not be the only indication of meaning
- Error messages should be understandable
- Do not rely on color alone

## 18. Error Handling

Handle common failures gracefully.

Examples:

Empty item

```
Tambahkan minimal satu item ke invoice.
```

Invalid price

```
Masukkan harga yang valid.
```

Missing customer

If customer is required:

```
Masukkan nama customer terlebih dahulu.
```

PDF failure

```
PDF belum berhasil dibuat.
Coba lagi.
```

Do not show raw technical errors to users.

## 19. Testing

Focus testing on business logic rather than snapshot-heavy UI testing.

Priority:

- Calculator
  - calculateItemSubtotal()
  - calculateSubtotal()
  - calculateDiscount()
  - calculateTax()
  - calculateGrandTotal()
- Invoice number
  - Test numbering behavior.
- Storage
  - Test serialization/deserialization where practical.
- Validation
  - Test valid and invalid invoice data.

## 20. Code Organization

Recommended structure:

```
src/
├── components/
│   ├── ui/
│   ├── invoice/
│   └── dashboard/
│
├── layouts/
│   ├── Layout.astro
│   └── DashboardLayout.astro
│
├── pages/
│   ├── index.astro
│   ├── dashboard.astro
│   ├── settings.astro
│   └── invoice/
│       ├── new.astro
│       └── [id].astro
│
├── lib/
│   ├── invoice/
│   │   ├── calculator.ts
│   │   ├── pdf.ts
│   │   ├── number.ts
│   │   └── validation.ts
│   │
│   ├── storage/
│   │   └── local.ts
│   │
│   └── whatsapp.ts
│
├── types/
│   └── invoice.ts
│
└── styles/
    └── global.css
```

Keep business logic outside .astro files where practical.

## 21. Data Model

Even without a database, define TypeScript types.

### BusinessProfile

```ts
type BusinessProfile = {
  name: string;
  phone: string;
  address?: string;
  email?: string;
  logoDataUrl?: string;
};
```

### InvoiceItem

```ts
type InvoiceItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
};
```

### Invoice

```ts
type Invoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  customerName: string;
  customerPhone?: string;
  items: InvoiceItem[];
  discount: number;
  tax: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
```

Do not add fields that are not required by the MVP.

## 22. Performance

Notain should feel fast.

Requirements:

- Minimal JavaScript
- Avoid unnecessary dependencies
- Avoid huge image assets
- Lazy load where useful
- Keep initial page lightweight
- Do not ship a large UI framework just for simple interactions

Astro's partial hydration/islands approach should be used where appropriate.

## 23. Security & Privacy

Because data is stored locally:

- Do not send invoice data to an external server
- Do not collect customer data remotely
- Do not add analytics that expose invoice content
- Do not log invoice/customer information to console in production

Be transparent:

- Invoice data is stored locally in this browser.

## 24. Deployment

Deployment target:

- Render Static Site

Repository:

- GitHub → Render

Build command:

```
npm run build
```

Publish directory:

```
dist
```

No server required.

No Docker required.

No database required.

## 25. Definition of Done

Notain MVP is considered complete when a new user can:

- Open the landing page
- Understand what Notain does
- Start without creating an account
- Enter business profile
- Open dashboard
- Create an invoice
- Enter customer
- Add multiple items
- See automatic calculations
- See live preview
- Save invoice locally
- Re-open invoice
- Generate PDF
- Download PDF
- Open WhatsApp
- See prepared WhatsApp message
- Manually attach PDF
- Send invoice to customer
- Use the application comfortably on mobile

## 26. MVP User Journey

The complete experience should be:

```
                    NOTAIN
                       │
                       ▼
                  Landing Page
                       │
                       ▼
                Buat Invoice Gratis
                       │
                       ▼
                   Onboarding
                       │
                       ▼
                   Dashboard
                       │
                       ▼
                 + Buat Invoice
                       │
                       ▼
                Invoice Builder
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
        Customer                Items
                                  │
                                  ▼
                             Calculation
                                  │
                                  ▼
                            Live Preview
                                  │
                       ┌──────────┴──────────┐
                       ▼                     ▼
                  Download PDF        Kirim WhatsApp
                                             │
                                             ▼
                                      User attaches PDF
                                             │
                                             ▼
                                           Send
```

## 27. What Comes After MVP

Only after real users use Notain should we consider:

### Phase 2

- Better invoice history
- Invoice search
- Customer list
- More templates
- Duplicate invoice
- Invoice status
- Better local backup/export

### Phase 3

- Potential backend:
  - Authentication
  - PostgreSQL
  - Cloud sync
  - Invoice links
  - Customer management
  - Multi-device access

### Phase 4

- Potential monetization:
  - Free plan
  - Pro templates
  - Cloud storage
  - Custom branding
  - Invoice link
  - Business reports

Do not build these before validating the MVP.

## 28. Product Rule

When deciding whether to add a feature, ask:

Does this help an UMKM create and send an invoice faster?

If the answer is no, it probably does not belong in MVP.

## 29. Final MVP Stack

- Astro
- TypeScript
- Tailwind CSS
- Lucide
- Zod
- pdf-lib
- Vitest
- ESLint
- Prettier
- localStorage
- Intl API
- GitHub
- Render Static Site

The MVP should remain:

- Frontend-only
- No database
- No backend
- No auth
- No AI
- No payment
- No subscription

Primary success metric:

A real UMKM can create and send their first invoice without needing an explanation from the developer.
