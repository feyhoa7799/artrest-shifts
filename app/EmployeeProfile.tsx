'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function EmployeeProfile() {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const user = supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('employee_profiles')
        .select('*')
        .eq('user_id', (await user).data.user?.id)
        .single();

      setProfile(data);
    };

    fetchProfile();
  }, []);

  if (!profile) return <div>Загрузка профиля...</div>;

  return (
    <div className="p-4 rounded bg-white shadow">
      <h2 className="text-lg font-bold">{profile.full_name}</h2>
      <p>Должность: {profile.role}</p>
      <p>Ресторан: {profile.home_restaurant_id}</p>
      <p>Email: {profile.email}</p>
      <p>Телефон: {profile.phone}</p>
      <p>Дата регистрации: {new Date(profile.created_at).toLocaleString()}</p>
    </div>
  );
}