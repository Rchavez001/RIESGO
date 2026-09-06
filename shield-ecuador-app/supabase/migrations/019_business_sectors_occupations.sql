-- Upgrade the business sector catalog into a proper Occupation/Industry list,
-- administrable from the admin panel (load, delete, save), replacing the
-- previous 7 generic categories with a detailed real-world catalog.

ALTER TABLE public.business_sectors
  ADD COLUMN IF NOT EXISTS industry TEXT;

-- Retire the old generic categories that don't map to a specific occupation
-- in the new catalog (kept in the table, just hidden from the picker).
UPDATE public.business_sectors
SET active = FALSE
WHERE code IN ('restaurante', 'ferreteria', 'farmacia');

INSERT INTO public.business_sectors (code, label, industry, active, display_order)
VALUES
  ('administrador_empresas', 'Administrador/a de empresas', 'Administracion, Finanzas y Oficina', TRUE, 10),
  ('asistente_administrativo', 'Asistente administrativo/a', 'Administracion, Finanzas y Oficina', TRUE, 20),
  ('cajero_banco', 'Cajero/a de banco', 'Administracion, Finanzas y Oficina', TRUE, 30),
  ('contador', 'Contador/a', 'Administracion, Finanzas y Oficina', TRUE, 40),
  ('economista', 'Economista', 'Administracion, Finanzas y Oficina', TRUE, 50),
  ('recepcionista', 'Recepcionista', 'Administracion, Finanzas y Oficina', TRUE, 60),
  ('secretario', 'Secretario/a', 'Administracion, Finanzas y Oficina', TRUE, 70),

  ('agricultor', 'Agricultor/a', 'Agropecuario y Pesca', TRUE, 80),
  ('ganadero', 'Ganadero/a', 'Agropecuario y Pesca', TRUE, 90),
  ('ingeniero_agronomo', 'Ingeniero/a agronomo', 'Agropecuario y Pesca', TRUE, 100),
  ('pescador', 'Pescador/a', 'Agropecuario y Pesca', TRUE, 110),

  ('cajero_general', 'Cajero/a general', 'Comercio y Ventas', TRUE, 120),
  ('comerciante', 'Comerciante', 'Comercio y Ventas', TRUE, 130),
  ('gerente_ventas', 'Gerente de ventas', 'Comercio y Ventas', TRUE, 140),
  ('tendero', 'Tendero/a (Propietario de tienda)', 'Comercio y Ventas', TRUE, 150),
  ('vendedor_mostrador', 'Vendedor/a de mostrador', 'Comercio y Ventas', TRUE, 160),

  ('disenador_grafico', 'Disenador/a grafico', 'Comunicacion, Marketing y Artes', TRUE, 170),
  ('fotografo', 'Fotografo/a', 'Comunicacion, Marketing y Artes', TRUE, 180),
  ('periodista', 'Periodista', 'Comunicacion, Marketing y Artes', TRUE, 190),
  ('publicista', 'Publicista', 'Comunicacion, Marketing y Artes', TRUE, 200),
  ('relacionista_publico', 'Relacionista publico', 'Comunicacion, Marketing y Artes', TRUE, 210),

  ('albanil', 'Albanil', 'Construccion e Infraestructura', TRUE, 220),
  ('arquitecto', 'Arquitecto/a', 'Construccion e Infraestructura', TRUE, 230),
  ('carpintero', 'Carpintero/a', 'Construccion e Infraestructura', TRUE, 240),
  ('electricista_construccion', 'Electricista (Construccion)', 'Construccion e Infraestructura', TRUE, 250),
  ('maestro_obra', 'Maestro/a de obra', 'Construccion e Infraestructura', TRUE, 260),
  ('plomero', 'Plomero/a', 'Construccion e Infraestructura', TRUE, 270),

  ('catedratico_universitario', 'Catedratico/a universitario', 'Educacion e Investigacion', TRUE, 280),
  ('investigador_cientifico', 'Investigador/a cientifico', 'Educacion e Investigacion', TRUE, 290),
  ('profesor', 'Profesor/a (Educacion basica/media)', 'Educacion e Investigacion', TRUE, 300),

  ('ama_de_casa', 'Ama de casa', 'Hogar, Cuidados y Servicios Generales', TRUE, 310),
  ('barrendero', 'Barrendero/a (Limpieza publica)', 'Hogar, Cuidados y Servicios Generales', TRUE, 320),
  ('conserje', 'Conserje', 'Hogar, Cuidados y Servicios Generales', TRUE, 330),
  ('cuidador_personas', 'Cuidador/a de personas', 'Hogar, Cuidados y Servicios Generales', TRUE, 340),
  ('empleada_domestica', 'Empleada/o domestica/o', 'Hogar, Cuidados y Servicios Generales', TRUE, 350),
  ('personal_limpieza', 'Personal de limpieza', 'Hogar, Cuidados y Servicios Generales', TRUE, 360),

  ('cantinero', 'Cantinero/a (Bartender)', 'Hosteleria, Turismo y Gastronomia', TRUE, 370),
  ('chef', 'Chef', 'Hosteleria, Turismo y Gastronomia', TRUE, 380),
  ('cocinero', 'Cocinero/a', 'Hosteleria, Turismo y Gastronomia', TRUE, 390),
  ('guia_turistico', 'Guia turistico', 'Hosteleria, Turismo y Gastronomia', TRUE, 400),
  ('mesero', 'Mesero/a', 'Hosteleria, Turismo y Gastronomia', TRUE, 410),
  ('recepcionista_hotel', 'Recepcionista de hotel', 'Hosteleria, Turismo y Gastronomia', TRUE, 420),

  ('ingeniero_aeroespacial', 'Ingeniero/a aeroespacial', 'Ingenieria, Manufactura y Mecanica', TRUE, 430),
  ('ingeniero_civil', 'Ingeniero/a civil', 'Ingenieria, Manufactura y Mecanica', TRUE, 440),
  ('ingeniero_electrico', 'Ingeniero/a electrico', 'Ingenieria, Manufactura y Mecanica', TRUE, 450),
  ('ingeniero_industrial', 'Ingeniero/a industrial', 'Ingenieria, Manufactura y Mecanica', TRUE, 460),
  ('ingeniero_mecanico', 'Ingeniero/a mecanico', 'Ingenieria, Manufactura y Mecanica', TRUE, 470),
  ('mecanico_automotriz', 'Mecanico/a automotriz', 'Ingenieria, Manufactura y Mecanica', TRUE, 480),
  ('operador_maquinaria_pesada', 'Operador/a de maquinaria pesada', 'Ingenieria, Manufactura y Mecanica', TRUE, 490),
  ('soldador', 'Soldador/a', 'Ingenieria, Manufactura y Mecanica', TRUE, 500),
  ('tornero', 'Tornero/a', 'Ingenieria, Manufactura y Mecanica', TRUE, 510),

  ('abogado', 'Abogado/a', 'Legal y Justicia', TRUE, 520),
  ('juez', 'Juez/a', 'Legal y Justicia', TRUE, 530),
  ('notario', 'Notario/a', 'Legal y Justicia', TRUE, 540),

  ('enfermero', 'Enfermero/a', 'Salud', TRUE, 550),
  ('farmaceutico', 'Farmaceutico/a', 'Salud', TRUE, 560),
  ('fisioterapeuta', 'Fisioterapeuta', 'Salud', TRUE, 570),
  ('medico_especialista', 'Medico/a especialista', 'Salud', TRUE, 580),
  ('medico_general', 'Medico/a general', 'Salud', TRUE, 590),
  ('odontologo', 'Odontologo/a', 'Salud', TRUE, 600),
  ('paramedico', 'Paramedico/a', 'Salud', TRUE, 610),
  ('psicologo', 'Psicologo/a', 'Salud', TRUE, 620),

  ('bombero', 'Bombero/a', 'Seguridad y Defensa', TRUE, 630),
  ('guardia_seguridad', 'Guardia de seguridad', 'Seguridad y Defensa', TRUE, 640),
  ('militar', 'Militar (Fuerzas Armadas)', 'Seguridad y Defensa', TRUE, 650),
  ('policia', 'Policia', 'Seguridad y Defensa', TRUE, 660),

  ('administrador_bases_datos', 'Administrador/a de bases de datos', 'Tecnologia de la Informacion', TRUE, 670),
  ('analista_datos', 'Analista de datos', 'Tecnologia de la Informacion', TRUE, 680),
  ('desarrollador_web', 'Desarrollador/a web', 'Tecnologia de la Informacion', TRUE, 690),
  ('ingeniero_ciberseguridad', 'Ingeniero/a de ciberseguridad', 'Tecnologia de la Informacion', TRUE, 700),
  ('ingeniero_sistemas', 'Ingeniero/a de sistemas', 'Tecnologia de la Informacion', TRUE, 710),
  ('ingeniero_software', 'Ingeniero/a de software', 'Tecnologia de la Informacion', TRUE, 720),
  ('soporte_tecnico', 'Soporte tecnico', 'Tecnologia de la Informacion', TRUE, 730),

  ('chofer_transporte_publico', 'Chofer de transporte publico', 'Transporte y Logistica', TRUE, 740),
  ('conductor_carga_pesada', 'Conductor/a de carga pesada', 'Transporte y Logistica', TRUE, 750),
  ('piloto_aviacion', 'Piloto de aviacion', 'Transporte y Logistica', TRUE, 760),
  ('repartidor', 'Repartidor/a (Delivery)', 'Transporte y Logistica', TRUE, 770),

  ('otro', 'Otro', 'Otro', TRUE, 9999)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  industry = EXCLUDED.industry,
  active = EXCLUDED.active,
  display_order = EXCLUDED.display_order;

-- Extend the admin save function to also persist the industry grouping.
-- Appended as a new trailing parameter with a default so existing callers
-- that don't pass it keep working.
CREATE OR REPLACE FUNCTION public.save_business_sector(
  original_code TEXT,
  sector_code TEXT,
  sector_label TEXT,
  sector_active BOOLEAN,
  sector_display_order INT DEFAULT 100,
  sector_industry TEXT DEFAULT NULL
)
RETURNS public.business_sectors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_original TEXT := lower(trim(coalesce(original_code, '')));
  normalized_code TEXT := lower(regexp_replace(trim(sector_code), '[^a-zA-Z0-9_]+', '_', 'g'));
  saved public.business_sectors%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can manage business sectors';
  END IF;

  IF normalized_code !~ '^[a-z0-9_]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid sector code';
  END IF;

  IF length(trim(sector_label)) < 2 THEN
    RAISE EXCEPTION 'Invalid sector label';
  END IF;

  IF normalized_original = '' THEN
    INSERT INTO public.business_sectors (code, label, industry, active, display_order)
    VALUES (normalized_code, trim(sector_label), NULLIF(trim(coalesce(sector_industry, '')), ''), sector_active, coalesce(sector_display_order, 100))
    ON CONFLICT (code) DO UPDATE SET
      label = EXCLUDED.label,
      industry = EXCLUDED.industry,
      active = EXCLUDED.active,
      display_order = EXCLUDED.display_order
    RETURNING * INTO saved;
  ELSIF normalized_original = normalized_code THEN
    UPDATE public.business_sectors
    SET label = trim(sector_label),
        industry = NULLIF(trim(coalesce(sector_industry, '')), ''),
        active = sector_active,
        display_order = coalesce(sector_display_order, display_order)
    WHERE code = normalized_original
    RETURNING * INTO saved;
  ELSE
    UPDATE public.business_sectors
    SET code = normalized_code,
        label = trim(sector_label),
        industry = NULLIF(trim(coalesce(sector_industry, '')), ''),
        active = sector_active,
        display_order = coalesce(sector_display_order, display_order)
    WHERE code = normalized_original
    RETURNING * INTO saved;

    UPDATE public.users
    SET business_type = normalized_code
    WHERE business_type = normalized_original;

    UPDATE public.alerts
    SET target_business_types = array_replace(target_business_types, normalized_original, normalized_code)
    WHERE target_business_types IS NOT NULL
      AND normalized_original = ANY(target_business_types);
  END IF;

  IF saved.code IS NULL THEN
    RAISE EXCEPTION 'Business sector not found';
  END IF;

  RETURN saved;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_business_sector(TEXT, TEXT, TEXT, BOOLEAN, INT, TEXT) TO authenticated;
