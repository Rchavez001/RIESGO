# Checklist despliegue T-Pot

## Red y aislamiento

- [ ] T-Pot instalado en VM/host aislado.
- [ ] Sin acceso a base productiva CiberDojo.
- [ ] Sin secretos productivos en el sensor.
- [ ] Firewall limita administracion a IP/VPN autorizada.
- [ ] Elasticsearch/OpenSearch no expuesto publicamente sin gateway.
- [ ] TLS 1.2+ habilitado.

## Secretos

- [ ] `TPOT_ELASTIC_USERNAME` con rol solo lectura.
- [ ] `TPOT_ELASTIC_PASSWORD` configurado como Cloud Run env/secret.
- [ ] `TPOT_API_TOKEN` si aplica.
- [ ] `AI_API_KEY` solo si `AI_ANALYSIS_ENABLED=true`.
- [ ] No hay secretos en JS servido al navegador.

## Cloud Run Admin

- [ ] Variables T-Pot configuradas.
- [ ] `TPOT_ALLOWED_INDEXES` restringido.
- [ ] `AI_OUTPUT_REQUIRES_APPROVAL=true`.
- [ ] Basic Auth reemplazado por IdP/IAP en produccion cuando sea posible.
- [ ] Logs revisados sin payloads sensibles.

## Pruebas

- [ ] `node --check server.js`
- [ ] `npm test`
- [ ] `GET /api/admin/tpot/health`
- [ ] `GET /api/admin/tpot/logs`
- [ ] Crear job IA.
- [ ] Confirmar que resultado sin aprobar no muestra `raw_ai_output`.
- [ ] Aprobar job y confirmar salida auditada.

## Operacion

- [ ] Revisar auditoria semanal.
- [ ] Revisar indices permitidos despues de cambios T-Pot.
- [ ] Rotar credenciales lectoras.
- [ ] Validar que reportes educativos no contengan instrucciones ofensivas.
