import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGuard } from "@/features/academia/guard";
import { QuizPage } from "@/features/academia/quiz-page";

export const Route = createFileRoute("/_authenticated/academia/modulo/$codigo/quiz")({
  head: () => ({ meta: [{ title: "Quiz · Academia SMQ" }] }),
  component: RotaQuiz,
});

function RotaQuiz() {
  const { codigo } = Route.useParams();
  return (
    <AcademiaGuard>
      <QuizPage codigo={codigo} />
    </AcademiaGuard>
  );
}
