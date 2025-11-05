# Quick Start Guide

## 🚀 Fast Setup (5 minutes)

### 1. Install Dependencies
```bash
cd "d:\Megha\Electron App\time-tracker-new\time-tracker-reports"
npm install
```

### 2. Install Tailwind CSS v4
```bash
npm install tailwindcss@next
```

### 3. Create Environment File
Create `.env.local` in the project root:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Open Browser
Visit: **http://localhost:3000**

---

## 📋 Quick Commands Reference

| Command | Purpose |
|---------|---------|
| `npm install` | Install all dependencies |
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Run production server |
| `npm run lint` | Check code quality |

---

## 🔗 Important URLs

- **Development:** http://localhost:3000
- **Reports Page:** http://localhost:3000/reports/[userEmail]
- **Example:** http://localhost:3000/reports/user@example.com

---

## ✅ Checklist

- [ ] Node.js installed (v18+)
- [ ] Dependencies installed (`npm install`)
- [ ] Tailwind CSS installed (`npm install tailwindcss@next`)
- [ ] `.env.local` file created with Supabase credentials
- [ ] Development server running (`npm run dev`)
- [ ] Browser opened to http://localhost:3000

---

For detailed instructions, see **SETUP.md**



