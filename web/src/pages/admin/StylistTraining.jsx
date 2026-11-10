import { PageHeader } from '../../components/dash/Kit.jsx';
import { ModaTrainingPanel } from './System.jsx';

export default function StylistTraining() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="تدريب تويلا وقواعدها بدون كود"
        subtitle="علّم تويلا مصطلحات بنها الدارجة، وقواعد ترشيح المحلات، وعروض اليوم، لتتعلمها فوراً وتطبقها مع كل العملاء."
      />
      <ModaTrainingPanel />
    </div>
  );
}
