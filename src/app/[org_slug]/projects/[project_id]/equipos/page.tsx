'use client';

import { useParams } from 'next/navigation';
import DeptoDashboard from '@/components/awp/DeptoDashboard';

export default function EquiposPage() {
  const params = useParams();
  return (
    <DeptoDashboard
      projectId={params.project_id as string}
      depto="EQUIPOS"
      titulo="EQUIPOS Y"
      tituloAcento="MAQUINARIA"
      descripcion="Flota en faena: matrices de operación, certificaciones de izaje, disponibilidad y equipos detenidos — alimentado por el feed diario de la IA Aconex."
    />
  );
}
