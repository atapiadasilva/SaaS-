'use client';

import { useParams } from 'next/navigation';
import DeptoDashboard from '@/components/awp/DeptoDashboard';

export default function MedioAmbientePage() {
  const params = useParams();
  return (
    <DeptoDashboard
      projectId={params.project_id as string}
      depto="MEDIO_AMBIENTE"
      titulo="MEDIO"
      tituloAcento="AMBIENTE"
      descripcion="Permisos ambientales, monitoreos, planes de manejo y hallazgos — vigencias y consideraciones que condicionan la apertura de frentes."
    />
  );
}
