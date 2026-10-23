import { UsersTabs } from "./_shared";

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl">
      <UsersTabs />
      {children}
    </div>
  );
}
