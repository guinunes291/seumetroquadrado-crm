import { createFileRoute } from "@tanstack/react-router";
import { CertificadoPage } from "@/features/academia/certificado-page";

// Sem guard próprio: quem abre é decidido pela RLS de academia_certificados
// (o dono, a gestão dele e o admin). Para os demais, a página diz que não
// encontrou, sem revelar se o código existe.
export const Route = createFileRoute("/_authenticated/academia/certificado/$codigo")({
  head: () => ({ meta: [{ title: "Certificado · Academia SMQ" }] }),
  component: CertificadoRota,
});

function CertificadoRota() {
  const { codigo } = Route.useParams();
  return <CertificadoPage codigo={codigo} />;
}
