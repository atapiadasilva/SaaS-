'use client';

import { useParams } from 'next/navigation';
import DeptoDashboard from '@/components/awp/DeptoDashboard';

export default function SsoPage() {
  const params = useParams();
  return (
    <DeptoDashboard
      projectId={params.project_id as string}
      depto="SSO"
      titulo="SEGURIDAD Y SALUD"
      tituloAcento="OCUPACIONAL"
      descripcion="Procedimientos de trabajo seguro, matrices de operación, permisos de alto riesgo e incidentes — todo lo SSO del contrato CC-06."
    />
  );
}
