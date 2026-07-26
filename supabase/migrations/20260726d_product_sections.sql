-- Agregar columna section a market_products
ALTER TABLE market_products ADD COLUMN IF NOT EXISTS section TEXT;

-- ─── SUPERMERCADO ─────────────────────────────────────────────────────────────

UPDATE market_products SET section = 'Granos y Cereales' WHERE id IN (
  '1eba5009-7777-4514-966c-3482c2f4484a', -- Arroz
  '5dccd8b4-9328-4b79-a258-f47ad7be757a', -- Avena
  'f93674bc-37d5-471f-8b05-365336b887d4', -- Garbanzos
  'bbb91d97-f680-4ff4-8670-d6780b7acb9b', -- Harina de trigo
  'c6ed830e-56bb-4932-9149-9e1c9755e53c', -- Harina pan
  'b46d1310-7da9-44e9-a005-e63cfd5040ac', -- Lentejas
  'f115ddd9-2af9-4326-8387-e766201d6713', -- Maíz enlatado
  'e5151996-6157-4213-98dd-c3088ddcf054', -- Maiz pira
  '53076751-431e-48d1-bbae-0c971aa538b3', -- Pasta corta
  'ef9be3ad-e938-4c5a-83e3-641d687c98f1', -- Pasta larga
  '0a3d7849-c185-46c3-a91d-f62d122ef223', -- Raviolis
  'cb203ba4-69f5-4f0c-8c20-45f4d67df1b7', -- Risotto
  '1fdcb59e-5e45-4ae7-a9c8-0f6339b5f5b5'  -- Tortillas de harina
);

UPDATE market_products SET section = 'Lácteos y Huevos' WHERE id IN (
  'c099ee63-2dcb-4470-abae-e80688bdee94', -- Crema de leche
  '6b29c4b5-860f-4967-a6c1-c83b6c878e2f', -- Leche
  '772ba42e-38bc-4cd8-bc8a-63390ff3f7e5', -- Leche condensada
  '03a6719b-7f31-4071-a02e-cea1908d0f3c', -- Mantequilla en barra
  'a5111aa8-feba-4492-bdbc-5500d77f3e94', -- Queso doblecrema
  'dbd80b89-26d7-465c-8613-3f1978d1a0fd', -- Queso parmesano
  '339f5c3b-76ac-434d-a463-d48bca044264', -- Suero costeño
  '228ab87b-33b3-44be-9d3d-4d43996d6e18', -- Yogurt
  '6196e172-7090-4baf-865a-7f6034d41f26', -- Yogurt griego
  '19d35509-3abe-495d-bef2-a8bdf3c7765d'  -- Yox
);

UPDATE market_products SET section = 'Aceites, Salsas y Condimentos' WHERE id IN (
  'bb1a155f-4504-499a-a878-de6878ac6081', -- Aceite de oliva
  '682f040c-08ea-42c7-b474-a8f0c2a092f1', -- Aceite vegetal
  '39c2631a-3d28-4aba-a4de-1140628eef51', -- Azúcar
  '46c3dacd-621d-40ce-b829-eded6a2e621a', -- Caldo de gallina pastilla
  '3e50c077-632d-4197-ac5f-3a6e6b8caace', -- Canela
  '73b9f8ca-171f-4872-86bb-b9623279029a', -- Chocolate corona
  '7838eb3f-e0c8-4b17-895e-c319e33d272f', -- Cúrcuma
  '6ab630d4-a46e-4004-aa83-e584fb2ffbb5', -- Mayonesa
  '3194b3bb-6f42-4370-b607-ff7fdb04ccaa', -- Mermelada
  'ae53e9b3-97ec-478e-b33c-dda28263dd46', -- Mostaza
  '4db8109b-4b81-4eaa-8a45-612f6b35ff5b', -- Oregano
  '184f29e4-2839-47da-840c-83211d5c998f', -- Paprika
  '15613c30-3fb6-4181-a77b-be1e019cb7e5', -- Pasta tomate
  'b67dc9b8-7144-45a2-bec7-f3d4b96e14b7', -- Sal
  '332c52cf-ec85-4cde-9a80-95618f0df3c7', -- Sal mesa
  '158d60db-4c62-4912-9769-94491fd049ae', -- Salsa de soya
  '413663cc-5b55-4237-8151-0d7745f7e4cf', -- Salsa de tomate
  '6503970f-c401-4c67-9e99-5f01c0fefefc', -- Salsa inglesa
  '3834e6b7-41fd-440a-8830-e12fe5b04803', -- Sazona todo
  '7e1735d1-173c-4ec7-ae31-dc813443d494', -- Siracha
  '8957a4ba-8cbb-40e1-b6e0-85a102c90d4b', -- Tomillo
  'c4b7f6f6-94f0-4e4a-be7d-aea9cbe5a61b', -- Vainilla
  '9d0f3b2f-41b6-4e41-8611-495d7df00830', -- Vinagre
  'ce8f2207-e90a-420b-885b-eeed798b7bc7'  -- Vinagreta
);

UPDATE market_products SET section = 'Panadería y Galletería' WHERE id IN (
  'ee0977f8-a748-4c48-8f7a-4c79eaac5105', -- Pan tajado
  'fbeb37bb-9228-4aa8-bd2b-e402362ddd34', -- Croutones
  'd3fa2e5b-f12e-4909-82ce-fdbbf0620efb', -- Tostadas
  '12d21cf0-3c62-4029-ba7d-c24a1b0d2e35', -- Galletas saltin noel
  'f4399c0e-e26a-4f6d-b9a0-be1cc46803a5', -- Galletas tosh
  'aa258c5d-7ad8-4c99-a1b6-543f651a5dd2', -- Galletas wafer
  '5f14c5c4-a4d3-4b2c-9897-41e98c490d2a'  -- Gelatina
);

UPDATE market_products SET section = 'Snacks y Dulces' WHERE id IN (
  '0a00b21c-1c68-4cb7-8ce7-62d50b8a4415', -- Bocadillos velenos
  'cc0db0e0-e045-4f83-aa8a-0b24288b3e01', -- Chicharrones de paquete
  '272fa3e4-8fce-4653-b43b-74bd6bea0117', -- Chocoramo
  '8db33f02-6a89-415d-8d87-b1ae8829f1a5', -- Nachos
  '8ab91f3a-3130-4c72-8751-18afdb72f861'  -- Papas a la francesa
);

UPDATE market_products SET section = 'Embutidos y Enlatados' WHERE id IN (
  '2a4f70eb-3222-4ab2-8aa2-2b4a0eaeb073', -- Atún
  'f068e6d0-1753-49c2-9ea0-0679eb3b624d', -- Chorizo santa rosano
  '46f04ad3-8fe7-4289-9b92-5ec16bd59f76', -- Jamón
  '3a5328c4-812d-4776-9b35-acb818aba93c', -- Pepperoni
  '88ccb5a4-86af-4cc6-9fdf-11d16fee71d2', -- Salchichas
  'e781b9f2-5b23-4626-85a2-02f8005aeaaf'  -- Tocineta
);

UPDATE market_products SET section = 'Bebidas' WHERE id IN (
  '8acf948b-54de-439b-baa2-4f4046510354', -- Gaseosa coca cola
  'cfcc7b78-08ee-4995-876a-c76562c1936b', -- Gaseosa ginger
  'c73c83ed-315b-4e73-b266-dcb98adf7d81', -- Jugo de naranja
  '3c002b74-46ee-49f3-ad2f-cdec5871930b', -- Jugos de lulo
  '4cc6a64b-94ce-46da-b894-d01108894a39', -- Smirnoff
  'd33cfe21-a4c2-4694-8c47-bfbc27026693'  -- Te en polvo
);

UPDATE market_products SET section = 'Aseo Personal' WHERE id IN (
  '18a24f6e-08f5-4011-b668-0c4fc7768c93', -- Agua oxigenada
  'e7ce1bc5-54b5-4c2f-afb9-598eedac0058', -- Alcohol anticeptico
  'e5ca5523-1a32-4628-bbe7-86216a022ec4', -- Algodón medicinal
  '442da48f-3742-4cde-a0fa-64e954ffc3f1', -- Crema de dientes
  '1b3205db-5c0a-42e8-999b-6c61373b76cd', -- Cuchillas afeitar
  '8597326a-b18e-4bdf-b21b-385e08e0e4a2', -- Curitas
  'c536de7e-bd2a-46d2-a17a-ccaf203edb19', -- Desodorante mafe
  '2faa7373-0d32-4622-b776-4f7468a670a5', -- Jabón del cuerpo
  'd4152487-2355-4d3b-9d81-d846ad358ca0', -- Pañitos húmedos
  'f1b5bdc2-8406-4f11-89cb-1b9e15bdb19d', -- Protectores diarios
  'e388e8e4-a69b-4bd2-89d9-eda4dbaf6033', -- Shampoo fer
  'b7ec6e63-1e90-4a34-be0a-e41bae29c20b', -- Shampoo mafe
  'e1490805-e15e-450f-acf3-c5bb6bf9fa16', -- Shampoo seco
  '1ff43004-23b0-4d4c-8caa-c3ed23d49c01', -- Toallas eterna
  '0c774fbe-7073-4ac0-9520-4b5d9ea44447'  -- Toallas higiénicas
);

UPDATE market_products SET section = 'Aseo del Hogar' WHERE id IN (
  'b586fbf6-f545-4f46-a855-93300ddcb9ee', -- Bolsa de basura
  '769107e4-33a2-4276-aa4b-380913c904ff', -- Bolsas ziploc
  'dd510722-2914-4dcd-b367-253188d557e3', -- Clorox ropa blanca
  '8b3d6ee1-8046-4dca-aa85-7c64ab17abdf', -- Clorox ropa color
  '06422dc5-add0-461f-84b7-b3d930dc39f8', -- Desengrasante
  '0449aa60-f3f9-4f5f-80ec-ca016f38d27e', -- Esponjas
  'a48e1b3d-98ff-4b29-9cb8-ae2b7eb488f2', -- Esponjilla
  'ab59f7ef-a3a7-44ea-8821-c75d3c114d95', -- Guantes
  'e874b21b-6c3f-40ad-98c2-652300ed38a4', -- Jabón líquido losa
  'b38b603e-4ad2-46b4-9673-9cb0ded877b9', -- Jabón líquido manos
  '7458eb3c-8854-4805-a2a3-01e03370f468', -- Jabon liquido ropa
  '4c5cf4e2-c8ef-4749-a979-b658e23faccb', -- Jabon rey
  'cf2d804c-8b8c-4354-b17b-65d6123f0a53', -- Limpiador piso
  'dc87b289-fe5c-408d-a864-4e4d50b99089', -- Papel cocina
  'ed54f4c9-c2fa-4f9c-8a20-69872a73a3ee', -- Papel higiénico
  'dcd88d7b-ff41-4356-82d3-4d1590f45d61', -- Pepitas downie
  'a8f7b955-c672-4b19-89a5-49f40f41984a', -- Servilletas
  '95b675d7-aae3-4138-ba2a-873b5dbcbb01'  -- Toallas clorox
);

-- ─── FRUTAS Y VERDURAS ────────────────────────────────────────────────────────

UPDATE market_products SET section = 'Frutas' WHERE id IN (
  '7d5714d9-1e6e-4976-a2bd-7526621a4576', -- Aguacates verdes
  'ca9c65aa-27f5-4704-87a1-b5b2647ccf95', -- Banano
  '6db9156d-acdb-4d8e-a9ad-d9c67297002b', -- Fresa
  '8c020e5f-89b3-4358-b74c-04fdd92cd008', -- Lulo
  'cb003271-5e36-407c-9597-9080cfb0a721', -- Mango
  'c37b81cf-23b8-4030-9ab9-b1d57da418b9', -- Manzanas verdes
  'e76083c5-3b6c-4f30-95ce-9832ed85aaa6', -- Maracuya
  '33e28a50-35cc-4619-9c77-921d6a46c80e', -- Mora
  '56a71231-7640-4ff4-bc64-1af37031d8a9', -- Papaya
  '2038b87e-b003-4b94-81e3-f6ffac8d2ec0'  -- Piña
);

UPDATE market_products SET section = 'Verduras y Hortalizas' WHERE id IN (
  'ad567882-6044-4e08-835d-0fa0acfa82f0', -- Ajo
  'c20ceb92-7cd6-42db-83af-95d87268ad97', -- Alverjas
  'fab753dc-f3be-4114-a429-488ece3dcf72', -- Cebolla cabezona blanca
  'deec31d3-6fe4-4405-a5e0-abcfad8dd304', -- Cebolla cabezona roja
  'de4596d4-b9fc-4c50-a696-7a1c88de20ce', -- Cebolla larga
  '99a09335-2b0c-44f9-a0bc-b06a5f6ee692', -- Champiñones
  '9e32a77a-8d1b-4209-8085-fff71192007c', -- Cilantro
  '65aef205-407c-487b-b1d1-8bbae817f312', -- Frijoles
  '4d1acad5-065f-410a-b7ce-8e6a25263a74', -- Lechuga
  'e7efe308-9549-4952-ba82-21e24697ffe7', -- Pimentón rojo
  '7b02121a-1189-4166-9923-3892c57d2bf3', -- Pimentón verde
  'a4bfa7e7-2ebe-4ed9-8795-c80b683f444f', -- Tomate
  'fb2c716d-db78-4c61-92bb-d04895eab36b', -- Zanahoria
  '899afc2c-8710-45a5-8eba-7383deffa579', -- Zuquini amarillo
  '431446f0-47ee-4642-a32c-508ac6f13896'  -- Zuquini verde
);

UPDATE market_products SET section = 'Tubérculos y Plátanos' WHERE id IN (
  '5caf3262-7613-40d4-a71b-e98f4f72a2bf', -- Ahuyama
  'e6dc952f-db78-4c61-92bb-d04895eab36b', -- Papa
  '94c19207-419c-4c15-9af6-0ba317daa832', -- Papa criolla
  'ec8b7ca8-931e-40e3-acf3-4e4edbcb0c34', -- Plátano maduro
  '4482b584-f28a-4ee9-9d54-a53531898153', -- Plátanos verdes
  '05719e9a-76dd-4f63-9c25-9ca59584ce2c'  -- Yuca
);

UPDATE market_products SET section = 'Otros' WHERE id IN (
  '978e5abe-7e36-4c4a-add4-d09bcd6fbd32'  -- Huevos
);

-- ─── CARNES ───────────────────────────────────────────────────────────────────

UPDATE market_products SET section = 'Pollo' WHERE id IN (
  '5f0d2506-3f56-4586-8e42-d125e0c51abf', -- Alitas de pollo
  'b018b55c-a189-4144-9fd5-a6bc9cbb977b', -- Muslos de pollo
  'd15dc2a0-c11a-497f-8162-062659bba672'  -- Pechuga de pollo
);

UPDATE market_products SET section = 'Res' WHERE id IN (
  'ebd2a3a4-e9e3-4bf8-9b05-9bfb238b688f', -- Carne de res molida
  'ba5955ad-c13a-410c-9de3-35a89446ac4e', -- Carne de res para asar
  '452470a7-e847-4529-84c7-f0e048549d79'  -- Carne de res para sudar
);

UPDATE market_products SET section = 'Cerdo' WHERE id IN (
  '7fdf141d-6dfc-42c7-8683-16908f0b193a', -- Costillas cerdo
  '5f3d755e-5e3c-4d5e-8f40-58f84a6db606', -- Guanchaco
  '49887032-067d-4d2a-bbed-e211bfd69b38'  -- Panceta de cerdo
);

UPDATE market_products SET section = 'Mariscos' WHERE id IN (
  '7b795875-9a48-4816-bb3c-81afbbe88b0f', -- Camarones
  '875309b2-447d-472f-8157-602f8ca8d35d', -- Filete mojarra
  'd05909a9-b139-4b5f-8b18-65c559edef02'  -- Pulpo
);
