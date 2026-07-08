'use client';

import { useParams } from 'next/navigation';
import DeptoDashboard from '@/components/awp/DeptoDashboard';

export default function RrhhPage() {
  const params = useParams();
  return (
    <DeptoDashboard
      projectId={params.project_id as string}
      depto="RRHH"
      titulo="RECURSOS"
      tituloAcento="HUMANOS"
      descripcion="Dotación diaria por disciplina, acreditaciones, competencias y ausentismo — alimentado por el feed diario de la IA Aconex."
    />
  );
}
