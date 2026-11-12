-- Coleção Criador: as skins dos criadores com "Dev" antes do nome (Dev Abner, Dev João Pedro, Dev Tiago), para
-- bancos onde as migrações 20261106000400 / 0600 / 0700 já rodaram com o nome antigo
update public.items set name = 'Dev Abner' where id = 'abner';
update public.items set name = 'Dev João Pedro' where id = 'joao_pedro';
update public.items set name = 'Dev Tiago' where id = 'tiago';
