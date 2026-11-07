-- Datos mínimos para simular la operación. Se ejecuta una sola vez por
-- arranque, sobre una base recién migrada (todas las migraciones).
insert into public.transit_routes (name, general_fare, student_fare)
select 'Ruta Simulación', 500, 250
 where not exists (select 1 from public.transit_routes where name = 'Ruta Simulación');

insert into public.vehicles
  (route_id, plate_number, vehicle_type, driver_name, driver_doc_id,
   bank_code, bank_account_or_phone, validator_mac)
select r.id, 'SIM001', 'BUS', 'Chofer Simulación', 'V-10000001',
       '0102', '04141234567', 'A0B1C2D3E4F5'
  from public.transit_routes r
 where r.name = 'Ruta Simulación'
   and not exists (select 1 from public.vehicles where plate_number = 'SIM001');

-- Operador del back-office para la simulación. PIN 258036, sin TOTP.
insert into public.accounts
  (nombres, apellidos, cedula, telefono, correo, pin_hash, rol)
select 'Operador', 'Simulación', '34201580', '04141234567',
       'operador@blink.local',
       extensions.crypt('258036', extensions.gen_salt('bf', 10)), 'ADMIN'
 where not exists (select 1 from public.accounts where cedula_digitos = '34201580');
