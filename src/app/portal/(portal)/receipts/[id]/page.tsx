import Receipt from '@/components/contributions/Receipt'

// The portal layout already requires a signed-in member; the API returns
// only the member's own receipts.
export default async function PortalReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Receipt id={id} backHref="/portal/history" />
}
