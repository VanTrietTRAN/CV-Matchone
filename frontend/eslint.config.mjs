// ESLint cho Next.js 16 (flat config). `npm run lint` trước đây thất bại vì
// thiếu cả gói eslint lẫn file cấu hình.
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'],
  },
  {
    rules: {
      // Mã hiện có dùng `any` ở nhiều chỗ đọc dữ liệu API — cảnh báo để dọn dần,
      // không chặn build.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Rule mới của React Compiler: báo cả mẫu "setLoading(true) rồi fetch" phổ
      // biến trong các trang hiện có. Để cảnh báo, sửa dần — không chặn lint.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]

export default config
