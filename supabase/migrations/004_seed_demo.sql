begin;

insert into public.room_categories (name, description, default_capacity, default_nightly_rate)
values
  ('Standard', 'Conforto essencial para viagens rápidas e estadias a trabalho.', 2, 189.00),
  ('Executivo', 'Mais espaço, estação de trabalho e comodidades ampliadas.', 2, 249.00),
  ('Família', 'Configuração versátil para famílias e pequenos grupos.', 4, 329.00)
on conflict (name) do update set
  description = excluded.description,
  default_capacity = excluded.default_capacity,
  default_nightly_rate = excluded.default_nightly_rate;

insert into public.rooms (
  room_number, category_id, floor, bed_type, bed_count, max_capacity,
  standard_nightly_rate, amenities, description
)
select seed.room_number, category.id, seed.floor, seed.bed_type, seed.bed_count,
       seed.capacity, seed.rate, seed.amenities, seed.description
from (values
  ('101', 'Standard', 1, 'Casal', 1, 2, 189.00::numeric, array['Wi-Fi','Ar-condicionado','TV'], 'Quarto acolhedor no primeiro andar.'),
  ('102', 'Standard', 1, 'Solteiro', 2, 2, 189.00::numeric, array['Wi-Fi','Ar-condicionado','TV'], 'Duas camas de solteiro.'),
  ('103', 'Executivo', 1, 'Queen', 1, 2, 249.00::numeric, array['Wi-Fi','Ar-condicionado','Smart TV','Frigobar'], 'Quarto executivo com mesa de trabalho.'),
  ('104', 'Família', 1, 'Casal + solteiro', 3, 4, 329.00::numeric, array['Wi-Fi','Ar-condicionado','Smart TV','Frigobar'], 'Configuração confortável para famílias.'),
  ('201', 'Standard', 2, 'Casal', 1, 2, 199.00::numeric, array['Wi-Fi','Ar-condicionado','TV'], 'Quarto silencioso no segundo andar.'),
  ('202', 'Standard', 2, 'Solteiro', 2, 2, 199.00::numeric, array['Wi-Fi','Ar-condicionado','TV'], 'Duas camas de solteiro.'),
  ('203', 'Executivo', 2, 'Queen', 1, 2, 259.00::numeric, array['Wi-Fi','Ar-condicionado','Smart TV','Frigobar'], 'Executivo com vista para a cidade.'),
  ('204', 'Família', 2, 'Casal + solteiro', 3, 4, 339.00::numeric, array['Wi-Fi','Ar-condicionado','Smart TV','Frigobar'], 'Quarto amplo para famílias.'),
  ('301', 'Executivo', 3, 'Queen', 1, 2, 269.00::numeric, array['Wi-Fi','Ar-condicionado','Smart TV','Frigobar'], 'Executivo no andar superior.'),
  ('302', 'Executivo', 3, 'Queen', 1, 2, 269.00::numeric, array['Wi-Fi','Ar-condicionado','Smart TV','Frigobar'], 'Executivo no andar superior.'),
  ('303', 'Família', 3, 'Casal + solteiro', 3, 4, 349.00::numeric, array['Wi-Fi','Ar-condicionado','Smart TV','Frigobar'], 'Espaçoso e bem iluminado.'),
  ('304', 'Família', 3, 'Casal + solteiro', 3, 4, 349.00::numeric, array['Wi-Fi','Ar-condicionado','Smart TV','Frigobar'], 'Espaçoso e bem iluminado.')
) as seed(room_number, category_name, floor, bed_type, bed_count, capacity, rate, amenities, description)
join public.room_categories category on category.name = seed.category_name
on conflict (room_number) do nothing;

commit;
