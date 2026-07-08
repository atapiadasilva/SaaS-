'use client';

import { useParams } from 'next/navigation';
import DeptoDashboard from '@/components/awp/DeptoDashboard';

export default function CalidadPage() {
  const params = useParams();
  return (
    <DeptoDashboard
      projectId={params.project_id as string}
      depto="CALIDAD"
      titulo="GESTIÓN DE"
      tituloAcento="CALIDAD"
      descripcion="Procedimientos, ITP, protocolos, certificados y NCR del contrato — estado de aprobación en Aconex y consideraciones del feed diario."
    />
  );
}
