CREATE POLICY "propostas_midia_insert_proprio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'propostas-midia' AND (storage.foldername(name))[1] = auth.uid()::text AND public.is_active_member(auth.uid()));
CREATE POLICY "propostas_midia_select_proprio" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'propostas-midia' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "propostas_midia_delete_proprio" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'propostas-midia' AND (storage.foldername(name))[1] = auth.uid()::text);