import { Button, Dialog, Tabs } from '@poser/ui';
import { useState, type ReactNode } from 'react';
import { useUi } from '../state/ui';

/**
 * Daz export guide (PLAN.md section 4.3): how to get Daz figures into Poser
 * until the native Daz library reader arrives in Phase 3.
 */

function Steps({ children }: { children: ReactNode }) {
  return <ol className="guide-steps">{children}</ol>;
}

function Genesis8() {
  return (
    <>
      <p>Daz Studio exports Genesis 8 figures straight to FBX. You need nothing else.</p>
      <Steps>
        <li>Load the figure with the clothing and hair you want, and leave it in its default pose (or Pose › Zero).</li>
        <li>
          Select the figure. In <strong>Parameters › Mesh Resolution</strong>, set <strong>Resolution Level</strong> to <strong>Base</strong> (high resolution exports are huge and slow).
        </li>
        <li>
          <strong>File › Export</strong>, choose <strong>Autodesk FBX (*.fbx)</strong>, pick a new empty folder, and save.
        </li>
        <li>
          In the FBX options: format <strong>FBX 2014 – Binary</strong>; tick <strong>Figures</strong> and <strong>Props</strong>; untick lights, cameras, and animations.
        </li>
        <li>
          Tick <strong>Morphs</strong> and click <strong>Edit Morph Export Rules</strong>: add a rule with the morph names you want as sliders (for example <code>body</code> and your character's morphs) set to <strong>Export</strong>. Leave the rest off to keep the file small.
        </li>
        <li>
          Tick <strong>Collect Textures to Folder</strong>. Leave <strong>Merge Clothing into Figure Skeleton</strong> and <strong>Convert Clothing to Static Geometry</strong> unticked.
        </li>
        <li>
          In Poser, drop the whole export folder (or a zip of it) onto the app. The import wizard detects the Genesis 8 skeleton; check the height and click Import.
        </li>
      </Steps>
    </>
  );
}

function Genesis9() {
  return (
    <>
      <p>
        Genesis 9 exports badly to FBX (high resolution mesh, wrong armature scale, broken hair and shoes), so it goes through Blender with the free <strong>Diffeomorphic DAZ Importer</strong> add-on.
      </p>
      <Steps>
        <li>Install Blender (4.x) and the Diffeomorphic DAZ Importer add-on, and copy its Daz Studio export script into Daz Studio as its instructions describe.</li>
        <li>
          In Daz Studio, set the figure's <strong>Mesh Resolution</strong> to <strong>Base</strong>, save the scene (<code>.duf</code>), then run <strong>Export To Blender</strong> from the Diffeomorphic scripts.
        </li>
        <li>
          In Blender, open the <strong>DAZ Setup</strong> tab and <strong>Import DAZ</strong> the saved <code>.duf</code>.
        </li>
        <li>
          Click <strong>Merge Rigs</strong> so the clothing follows the body skeleton. To get body-shape sliders, import the morphs you want (<strong>Import Standard Morphs</strong> / <strong>Import Custom Morphs</strong>).
        </li>
        <li>
          Select the armature and its meshes, then <strong>File › Export › glTF 2.0</strong>: format <strong>glTF Binary (.glb)</strong>, <strong>Selected Objects</strong>, with <strong>Shape Keys</strong> and <strong>Skinning</strong> on and <strong>Animation</strong> off.
        </li>
        <li>Drop the <code>.glb</code> onto Poser. The wizard detects the Genesis 9 skeleton.</li>
      </Steps>
    </>
  );
}

function Tips() {
  return (
    <ul className="guide-steps">
      <li>If the height looks wrong in the wizard, set the units there (Daz FBX files are usually centimetres).</li>
      <li>If bones aren't matched, use <strong>Check bone matching</strong> in the wizard to fix them by hand.</li>
      <li>Drop broken hair or shoes and import them separately later, or leave them out.</li>
      <li>Daz content is for your own use here; its license doesn't allow sharing the exported files.</li>
      <li>Phase 3 adds a reader for your Daz library folder, so this step goes away.</li>
    </ul>
  );
}

export function DazGuideDialog() {
  const open = useUi((s) => s.dazGuideOpen);
  const set = useUi((s) => s.set);
  const [tab, setTab] = useState<'g8' | 'g9' | 'tips'>('g8');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => set({ dazGuideOpen: o })}
      title="Exporting from Daz"
      icon="info"
      large
      actions={<Button onClick={() => set({ dazGuideOpen: false })}>Done</Button>}
    >
      <Tabs
        label="Daz figure version"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'g8', label: 'Genesis 8 (FBX)', content: <Genesis8 /> },
          { value: 'g9', label: 'Genesis 9 (glTF)', content: <Genesis9 /> },
          { value: 'tips', label: 'Tips', content: <Tips /> },
        ]}
      />
    </Dialog>
  );
}
