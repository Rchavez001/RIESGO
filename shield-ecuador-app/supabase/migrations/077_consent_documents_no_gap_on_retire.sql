-- T06: consent_documents no puede quedar sin aviso vigente al retirar el publicado, salvo que la
-- misma transacción publique un reemplazo (REQ-01/02/03). Se implementa con una restricción
-- DIFERIBLE que solo se dispara en la transición published -> retired: permite que, dentro de la
-- misma transacción, primero se retire y luego se publique el reemplazo (o al revés), y solo falla
-- si al comprobarse (COMMIT, o SET CONSTRAINTS ... IMMEDIATE) no queda ninguna fila 'published'.
CREATE OR REPLACE FUNCTION public.enforce_consent_document_no_gap_on_retire()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.consent_documents WHERE status = 'published') THEN
    RAISE EXCEPTION 'consent_documents: retirar el aviso publicado sin reemplazo dejaría el módulo sin aviso vigente; publique el reemplazo en la misma transacción';
  END IF;
  RETURN NULL;
END; $$;

CREATE CONSTRAINT TRIGGER consent_documents_no_gap_on_retire
  AFTER UPDATE ON public.consent_documents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.status = 'published' AND NEW.status = 'retired')
  EXECUTE FUNCTION public.enforce_consent_document_no_gap_on_retire();
