import { patch } from './patchlib.mjs';
const file = 'apps/web/src/features/avatars/AvatarDesigner.tsx';

const old = `            <div className="designer-stage">
              {draft.layers
                ? <EnhancedPixelAvatar config={draft} animation={playing ? pose : 'blink'} size={176} grid={32} label={displayName} />
                : <ThemedAvatar avatarIndex={0} config={draft} animation={playing ? pose : 'idle'} size={176} label={displayName} />}
            </div>`;

const neu = `            <div className="designer-stage">
              {fullBody
                ? (
                  <FullBodyAvatar
                    archetype={archetype ?? archetypeForRace[race]}
                    animation={pose}
                    tints={draft.tints}
                    size={176}
                    label={displayName}
                    paused={!playing}
                  />
                )
                : draft.layers
                  ? <EnhancedPixelAvatar config={draft} animation={playing ? pose : 'blink'} size={176} grid={32} label={displayName} />
                  : <ThemedAvatar avatarIndex={0} config={draft} animation={playing ? pose : 'idle'} size={176} label={displayName} />}
            </div>

            {/*
              * Two bodies, one wardrobe.
              *
              * The bust is what a saved avatar is and what the rest of the app draws, so it is what
              * the drawers below edit. The full body is the same six colours on a figure with legs,
              * which is the only shape a walk, a leap or a cast can be judged in -- at shoulder
              * height every one of them can only be the picture sliding about.
              */}
            <div className="designer-bodyswitch" role="group" aria-label="รูปแบบตัวละครในพรีวิว">
              <button
                type="button"
                className={\`designer-pose \${fullBody ? '' : 'active'}\`}
                aria-pressed={!fullBody}
                onClick={() => setFullBody(false)}
              >
                ครึ่งตัว
              </button>
              <button
                type="button"
                className={\`designer-pose \${fullBody ? 'active' : ''}\`}
                aria-pressed={fullBody}
                onClick={() => setFullBody(true)}
              >
                เต็มตัว
              </button>
            </div>

            {fullBody && (
              <>
                <div className="designer-chips" role="group" aria-label="แบบตัวละครเต็มตัว">
                  {fullBodyArchetypeList.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={\`designer-catchip \${(archetype ?? archetypeForRace[race]) === option.id ? 'active' : ''}\`}
                      aria-pressed={(archetype ?? archetypeForRace[race]) === option.id}
                      title={option.description}
                      onClick={() => setArchetype(option.id)}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
                {/* The four colours worth changing while a pose is playing, on the stage itself. */}
                <div className="designer-stage-tints">
                  {stageTints.map((row) => (
                    <div key={row.key} className="designer-stage-tint">
                      <span>{row.label}</span>
                      <div role="group" aria-label={row.label}>
                        {row.swatches.map((colour) => {
                          const chosen = (draft.tints?.[row.key] ?? defaultTints[row.key]) === colour;
                          return (
                            <button
                              key={colour}
                              type="button"
                              className={\`designer-swatch \${chosen ? 'active' : ''}\`}
                              style={{ background: colour }}
                              aria-label={\`\${row.label} \${colour}\`}
                              aria-pressed={chosen}
                              onClick={() => setDraft((current) => ({
                                ...current, tints: { ...current.tints, [row.key]: colour }
                              }))}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}`;

patch(file, [[old, neu]]);
console.log('stage renders the full body, its archetypes and its colours');
