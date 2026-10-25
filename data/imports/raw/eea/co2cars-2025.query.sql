SELECT Mk, Cn, Ft, [Ec (cm3)] AS Ec, [Ep (KW)] AS Ep, COUNT(*) AS Registrations, MIN([M (kg)]) AS MassMin, MAX([M (kg)]) AS MassMax, MIN([Ewltp (g/km)]) AS Co2Min, MAX([Ewltp (g/km)]) AS Co2Max FROM [CO2Emission].[latest].[co2cars_2025Pv31] GROUP BY Mk, Cn, Ft, [Ec (cm3)], [Ep (KW)] ORDER BY Mk, Cn, Ft, Ec, Ep;

SELECT Mk, Cn, Va, Ve, Ft, [Ec (cm3)] AS Ec, [Ep (KW)] AS Ep, COUNT(*) AS Registrations, MIN([M (kg)]) AS MassMin, MAX([M (kg)]) AS MassMax FROM [CO2Emission].[latest].[co2cars_2025Pv31] GROUP BY Mk, Cn, Va, Ve, Ft, [Ec (cm3)], [Ep (KW)] ORDER BY Mk, Cn, Va, Ve, Ft, Ec, Ep;
