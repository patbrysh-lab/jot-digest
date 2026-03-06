import BottomNav from '@/components/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 pb-20 max-w-2xl mx-auto w-full">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}