import unittest
from gfl1_shooting import fade_motion
from gfl1_audio import discover_cues


class ShootingTests(unittest.TestCase):
    def test_timed_cues_preserve_names_and_ignore_motion_controls(self):
        self.assertEqual(discover_cues('<ShootPanel>%%audio=AVG_Pistol-0.2,AVG-Tinnitus-1%%tween=11-0.1</ShootPanel>')['sfx'], {'AVG_Pistol', 'AVG-Tinnitus'})
        from gfl1_selection import media_requests
        self.assertEqual(media_requests('<ShootPanel>%%bgnum=890%%manualCount=1</ShootPanel>')[0], [890])

    def test_native_hermite_conversion_matches_curve_values_and_steps(self):
        keys = [{'time':0., 'value':2., 'outSlope':3., 'inSlope':0., 'weightedMode':0},
                {'time':2., 'value':5., 'inSlope':-1., 'outSlope':float('inf'), 'weightedMode':0},
                {'time':3., 'value':9., 'inSlope':float('inf'), 'outSlope':0., 'weightedMode':0}]
        tree = {'ParameterIds':['P'], 'ParameterCurves':[{'m_Curve':keys}], 'ParameterFadeInTimes':[-1],
                'ParameterFadeOutTimes':[-1], 'MotionLength':3., 'FadeInTime':.2, 'FadeOutTime':.1}
        motion = fade_motion(tree)
        segments = motion['Curves'][0]['Segments']
        for fraction in [.1,.25,.5,.8]:
            bezier = (1-fraction)**3*2 + 3*(1-fraction)**2*fraction*segments[4] + 3*(1-fraction)*fraction**2*segments[6] + fraction**3*5
            hermite = (2*fraction**3-3*fraction**2+1)*2 + (fraction**3-2*fraction**2+fraction)*2*3 + (-2*fraction**3+3*fraction**2)*5 + (fraction**3-fraction**2)*2*(-1)
            self.assertAlmostEqual(bezier, hermite)
        self.assertEqual(segments[-3:], [2,3.,9.])
        self.assertEqual(motion['Meta']['TotalSegmentCount'], 2)
        self.assertEqual(motion['Meta']['TotalPointCount'], 5)
        keys[0]['weightedMode'] = 1
        with self.assertRaises(ValueError):
            fade_motion(tree)
