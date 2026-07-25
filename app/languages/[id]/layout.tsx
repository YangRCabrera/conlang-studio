import SideBar from './side-bar';

export default async function LanguageLayout({
  children,
  params,
}: LayoutProps<'/languages/[id]'>) {
  const { id } = await params;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <SideBar languageId={id} />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-y-auto p-4 md:p-6"
      >
        {children}
      </main>
    </div>
  );
}
