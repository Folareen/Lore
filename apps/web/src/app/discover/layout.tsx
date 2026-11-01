import {
  MarketingHeader,
  MarketingFooter,
} from '../../features/marketing/marketing-shell';
export default function DiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing discover-shell">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
