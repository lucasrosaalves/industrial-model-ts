import type {
  AggregateOptions,
  AggregateResult,
  AggregateResultItem,
  IndustrialModel,
  NodeId,
  QueryOptions,
  QueryResult,
  QueryResultItem,
  QuerySelect,
  UpsertOptions,
  UpsertResult,
} from "../types";

export type CogniteCoreViewExternalId =
  | "CogniteDescribable"
  | "CogniteSourceable"
  | "CogniteSourceSystem"
  | "CogniteSchedulable"
  | "CogniteVisualizable"
  | "Cognite3DTransformation"
  | "CogniteCubeMap"
  | "Cognite3DObject"
  | "Cognite3DModel"
  | "CogniteCADModel"
  | "Cognite3DRevision"
  | "CognitePointCloudModel"
  | "Cognite360ImageModel"
  | "CogniteCADRevision"
  | "CognitePointCloudRevision"
  | "Cognite360ImageCollection"
  | "CogniteCADNode"
  | "CognitePointCloudVolume"
  | "Cognite360Image"
  | "Cognite360ImageStation"
  | "Cognite360ImageAnnotation"
  | "CogniteAsset"
  | "CogniteAssetClass"
  | "CogniteAssetType"
  | "CogniteEquipment"
  | "CogniteEquipmentType"
  | "CogniteFile"
  | "CogniteFileCategory"
  | "CogniteActivity"
  | "CogniteTimeSeries"
  | "CogniteAnnotation"
  | "CogniteDiagramAnnotation"
  | "CogniteUnit";

export type CogniteDescribable = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
}>;

export type CogniteSourceable = IndustrialModel<
  {
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
  },
  {
    source?: CogniteSourceSystem;
  }
>;

export type CogniteSourceSystem = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  version?: string;
  manufacturer?: string;
}>;

export type CogniteSchedulable = IndustrialModel<{
  startTime?: string;
  endTime?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
}>;

export type CogniteVisualizable = IndustrialModel<
  {
    object3D?: NodeId;
  },
  {
    object3D?: Cognite3DObject;
  }
>;

export type Cognite3DTransformation = IndustrialModel<{
  translationX?: number;
  translationY?: number;
  translationZ?: number;
  eulerRotationX?: number;
  eulerRotationY?: number;
  eulerRotationZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
}>;

export type CogniteCubeMap = IndustrialModel<
  {
    front?: NodeId;
    back?: NodeId;
    left?: NodeId;
    right?: NodeId;
    top?: NodeId;
    bottom?: NodeId;
  },
  {
    front?: CogniteFile;
    back?: CogniteFile;
    left?: CogniteFile;
    right?: CogniteFile;
    top?: CogniteFile;
    bottom?: CogniteFile;
  }
>;

export type Cognite3DObject = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    zMin?: number;
    zMax?: number;
  },
  {
    asset?: CogniteAsset;
    cadNodes?: CogniteCADNode[];
    images360?: Cognite360Image[];
    pointCloudVolumes?: CognitePointCloudVolume[];
  }
>;

export type Cognite3DModel = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    thumbnail?: NodeId;
    type?: string;
  },
  {
    thumbnail?: CogniteFile;
  }
>;

export type CogniteCADModel = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    thumbnail?: NodeId;
    type?: string;
  },
  {
    thumbnail?: CogniteFile;
    revisions?: CogniteCADRevision[];
  }
>;

export type Cognite3DRevision = IndustrialModel<
  {
    status?: string;
    published?: boolean;
    type?: string;
    model3D?: NodeId;
  },
  {
    model3D?: Cognite3DModel;
  }
>;

export type CognitePointCloudModel = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    thumbnail?: NodeId;
    type?: string;
  },
  {
    thumbnail?: CogniteFile;
    revisions?: CognitePointCloudRevision[];
  }
>;

export type Cognite360ImageModel = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    thumbnail?: NodeId;
    type?: string;
  },
  {
    thumbnail?: CogniteFile;
    collections?: Cognite360ImageCollection[];
  }
>;

export type CogniteCADRevision = IndustrialModel<
  {
    status?: string;
    published?: boolean;
    type?: string;
    model3D?: NodeId;
    revisionId?: number;
  },
  {
    model3D?: CogniteCADModel;
  }
>;

export type CognitePointCloudRevision = IndustrialModel<
  {
    status?: string;
    published?: boolean;
    type?: string;
    model3D?: NodeId;
    revisionId?: number;
  },
  {
    model3D?: CognitePointCloudModel;
  }
>;

export type Cognite360ImageCollection = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    status?: string;
    published?: boolean;
    type?: string;
    model3D?: NodeId;
  },
  {
    model3D?: Cognite360ImageModel;
  }
>;

export type CogniteCADNode = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    object3D?: NodeId;
    model3D?: NodeId;
    cadNodeReference?: string;
    revisions?: NodeId[];
    treeIndexes?: number[];
    subTreeSizes?: number[];
  },
  {
    object3D?: Cognite3DObject;
    model3D?: CogniteCADModel;
    revisions?: CogniteCADRevision[];
  }
>;

export type CognitePointCloudVolume = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    object3D?: NodeId;
    model3D?: NodeId;
    volumeReferences?: string[];
    revisions?: NodeId[];
    volumeType?: string;
    volume?: number[];
    formatVersion?: string;
  },
  {
    object3D?: Cognite3DObject;
    model3D?: CogniteCADModel;
    revisions?: CogniteCADRevision[];
  }
>;

export type Cognite360Image = IndustrialModel<
  {
    translationX?: number;
    translationY?: number;
    translationZ?: number;
    eulerRotationX?: number;
    eulerRotationY?: number;
    eulerRotationZ?: number;
    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
    front?: NodeId;
    back?: NodeId;
    left?: NodeId;
    right?: NodeId;
    top?: NodeId;
    bottom?: NodeId;
    collection360?: NodeId;
    station360?: NodeId;
    takenAt?: string;
  },
  {
    front?: CogniteFile;
    back?: CogniteFile;
    left?: CogniteFile;
    right?: CogniteFile;
    top?: CogniteFile;
    bottom?: CogniteFile;
    collection360?: Cognite360ImageCollection;
    station360?: Cognite360ImageStation;
  }
>;

export type Cognite360ImageStation = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  groupType?: string;
}>;

export type Cognite360ImageAnnotation = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    confidence?: number;
    status?: string;
    polygon?: number[];
    formatVersion?: string;
  },
  {
    source?: CogniteSourceSystem;
  }
>;

export type CogniteAsset = IndustrialModel<
  {
    object3D?: NodeId;
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    parent?: NodeId;
    root?: NodeId;
    path?: NodeId[];
    pathLastUpdatedTime?: string;
    assetClass?: NodeId;
    type?: NodeId;
  },
  {
    object3D?: Cognite3DObject;
    source?: CogniteSourceSystem;
    parent?: CogniteAsset;
    root?: CogniteAsset;
    path?: CogniteAsset[];
    assetClass?: CogniteAssetClass;
    type?: CogniteAssetType;
    children?: CogniteAsset[];
    equipment?: CogniteEquipment[];
  }
>;

export type CogniteAssetClass = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  code?: string;
  standard?: string;
}>;

export type CogniteAssetType = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    code?: string;
    standard?: string;
    assetClass?: NodeId;
  },
  {
    assetClass?: CogniteAssetClass;
  }
>;

export type CogniteEquipment = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    asset?: NodeId;
    serialNumber?: string;
    manufacturer?: string;
    equipmentType?: NodeId;
    files?: NodeId[];
  },
  {
    source?: CogniteSourceSystem;
    asset?: CogniteAsset;
    equipmentType?: CogniteEquipmentType;
    files?: CogniteFile[];
  }
>;

export type CogniteEquipmentType = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  code?: string;
  equipmentClass?: string;
  standard?: string;
  standardReference?: string;
}>;

export type CogniteFile = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    assets?: NodeId[];
    mimeType?: string;
    directory?: string;
    isUploaded?: boolean;
    uploadedTime?: string;
    category?: NodeId;
  },
  {
    source?: CogniteSourceSystem;
    assets?: CogniteAsset[];
    category?: CogniteFileCategory;
  }
>;

export type CogniteFileCategory = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  code: string;
  standard?: string;
  standardReference?: string;
}>;

export type CogniteActivity = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    startTime?: string;
    endTime?: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
    assets?: NodeId[];
    equipment?: NodeId[];
    timeSeries?: NodeId[];
  },
  {
    source?: CogniteSourceSystem;
    assets?: CogniteAsset[];
    equipment?: CogniteEquipment[];
    timeSeries?: CogniteTimeSeries[];
  }
>;

export type CogniteTimeSeries = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    isStep: boolean;
    type: string;
    sourceUnit?: string;
    unit?: NodeId;
    assets?: NodeId[];
    equipment?: NodeId[];
    stateSet?: NodeId;
  },
  {
    source?: CogniteSourceSystem;
    unit?: CogniteUnit;
    assets?: CogniteAsset[];
    equipment?: CogniteEquipment[];
  }
>;

export type CogniteAnnotation = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    confidence?: number;
    status?: string;
  },
  {
    source?: CogniteSourceSystem;
  }
>;

export type CogniteDiagramAnnotation = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: string;
    sourceUpdatedTime?: string;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    confidence?: number;
    status?: string;
    startNodePageNumber?: number;
    endNodePageNumber?: number;
    startNodeXMin?: number;
    startNodeXMax?: number;
    startNodeYMin?: number;
    startNodeYMax?: number;
    startNodeText?: string;
    endNodeXMin?: number;
    endNodeXMax?: number;
    endNodeYMin?: number;
    endNodeYMax?: number;
    endNodeText?: string;
  },
  {
    source?: CogniteSourceSystem;
  }
>;

export type CogniteUnit = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  symbol?: string;
  quantity?: string;
  source?: string;
  sourceReference?: string;
}>;

export interface CogniteCoreModelByView {
  CogniteDescribable: CogniteDescribable;
  CogniteSourceable: CogniteSourceable;
  CogniteSourceSystem: CogniteSourceSystem;
  CogniteSchedulable: CogniteSchedulable;
  CogniteVisualizable: CogniteVisualizable;
  Cognite3DTransformation: Cognite3DTransformation;
  CogniteCubeMap: CogniteCubeMap;
  Cognite3DObject: Cognite3DObject;
  Cognite3DModel: Cognite3DModel;
  CogniteCADModel: CogniteCADModel;
  Cognite3DRevision: Cognite3DRevision;
  CognitePointCloudModel: CognitePointCloudModel;
  Cognite360ImageModel: Cognite360ImageModel;
  CogniteCADRevision: CogniteCADRevision;
  CognitePointCloudRevision: CognitePointCloudRevision;
  Cognite360ImageCollection: Cognite360ImageCollection;
  CogniteCADNode: CogniteCADNode;
  CognitePointCloudVolume: CognitePointCloudVolume;
  Cognite360Image: Cognite360Image;
  Cognite360ImageStation: Cognite360ImageStation;
  Cognite360ImageAnnotation: Cognite360ImageAnnotation;
  CogniteAsset: CogniteAsset;
  CogniteAssetClass: CogniteAssetClass;
  CogniteAssetType: CogniteAssetType;
  CogniteEquipment: CogniteEquipment;
  CogniteEquipmentType: CogniteEquipmentType;
  CogniteFile: CogniteFile;
  CogniteFileCategory: CogniteFileCategory;
  CogniteActivity: CogniteActivity;
  CogniteTimeSeries: CogniteTimeSeries;
  CogniteAnnotation: CogniteAnnotation;
  CogniteDiagramAnnotation: CogniteDiagramAnnotation;
  CogniteUnit: CogniteUnit;
}

export type CogniteCoreModel<TView extends CogniteCoreViewExternalId> =
  CogniteCoreModelByView[TView];

export type CogniteCoreQueryExecutor<TView extends CogniteCoreViewExternalId> = {
  <const TSelect extends QuerySelect<CogniteCoreModel<TView>>>(
    options: Omit<QueryOptions<CogniteCoreModel<TView>, TSelect>, "viewExternalId" | "select"> & {
      select: TSelect & QuerySelect<CogniteCoreModel<TView>>;
    },
  ): Promise<QueryResult<QueryResultItem<CogniteCoreModel<TView>, TSelect>>>;
  (
    options?: Omit<
      QueryOptions<CogniteCoreModel<TView>, undefined>,
      "viewExternalId" | "select"
    > & {
      select?: undefined;
    },
  ): Promise<QueryResult<QueryResultItem<CogniteCoreModel<TView>, undefined>>>;
};

export type CogniteCoreAggregateExecutor<TView extends CogniteCoreViewExternalId> = <
  const TOptions extends Omit<AggregateOptions<CogniteCoreModel<TView>>, "viewExternalId">,
>(
  options?: TOptions,
) => Promise<
  AggregateResult<
    AggregateResultItem<CogniteCoreModel<TView>, TOptions["groupBy"], TOptions["aggregate"]>
  >
>;

export type CogniteCoreUpsertExecutor<TView extends CogniteCoreViewExternalId> = (
  options: Omit<UpsertOptions<CogniteCoreModel<TView>>, "viewExternalId">,
) => Promise<UpsertResult>;
